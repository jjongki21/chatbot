const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');

const defURL = 'https://yktout-chatbot-web.onrender.com';
const defImg = defURL + '/images/kyeongsan_m_1_info.png';

const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use('/images', express.static(path.join(__dirname, 'images')));

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false, // ※ Render Postgres 기본 설정
	},
});

app.get('/', (req, res) => {
  res.send('Kakao Chatbot is running.');
});


/* ===============================
 * 카카오톡 챗봇 웹훅
 * =============================== */

app.post('/kakao/webhook', async (req, res) => {
	try {
		const body = req.body;
		const intentName = body.intent?.name || '';
		const params = body.action?.params || {};

		console.log('intentName:', intentName);
		console.log('raw params:', JSON.stringify(params, null, 2));

		const regionCode = getParam(params, 'region_code', 'gyeongsan');

		let kakaoResponse;

		switch (intentName) {
			case 'tourist_spots_list_culture': {
				const categoryCode = 'CULTURAL_TEMPLE';
				const spots = await getTouristSpots(regionCode, categoryCode);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, categoryCode);
				break;
			}
			case 'tourist_spots_list_nature': {
				const categoryCode = 'NATURE_WALK';
				const spots = await getTouristSpots(regionCode, categoryCode);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, categoryCode);
				break;
			}
			case 'tourist_spots_list_festival': {
				const categoryCode = 'FESTIVAL_ACTIVITY';
				const spots = await getTouristSpots(regionCode, categoryCode);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, categoryCode);
				break;
			}
			
			case 'tour_programs_list': {
				const courses = await getTourCourses(regionCode);
				kakaoResponse = buildTourCourseListResponse(courses);
				break;
			}
					
			case 'transport_info_list_parking': {
				const categoryCode = 'PARKING';
				const spots = await getTouristSpots(regionCode, categoryCode);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, categoryCode);
				break;
			}
			case 'transport_info_list_center': {
				const categoryCode = 'INFORMATION';
				const spots = await getTouristSpots(regionCode, categoryCode);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, categoryCode);
				break;
			}					

			case 'transport_info_list_bus': {
				
				break;
			}
			
			case 'transport_info_list_route': {
				
				break;
			}

				  case 'FAQ_목록': {
					const faqCategoryCode = getParam(params, 'category_code', null);
					console.log('[FAQ_목록] region:', regionCode, 'category:', faqCategoryCode);

					const faqs = await getFaqs(regionCode, faqCategoryCode);
					console.log('faqs.length =', faqs.length);

					kakaoResponse = buildFaqListResponse(faqs);
					break;
				  }

			default: {
				console.log('⚠ 알 수 없는 intentName:', intentName);
				kakaoResponse = buildSimpleTextResponse(
					'요청하신 내용을 이해하기가 조금 어려워요 😅\n' +
					'메뉴에서 관광지 안내, 시티투어, 교통정보, FAQ 중 하나를 다시 선택해 주세요.'
				);
			}
		}

		res.json(kakaoResponse);
	} catch (err) {
		console.error('Kakao Webhook Error:', err);
		const errorResponse = buildSimpleTextResponse(
			'잠시 시스템 오류가 발생했어요 😥\n' +
			'잠시 후 다시 시도해 주세요.'
		);
		res.json(errorResponse);
	}
});


/* ===============================
 * 지도 버튼 응답
 * =============================== */
 
app.get('/openmap', (req, res) => {
	const { lat, lng, name } = req.query;

	const userAgent = req.headers['user-agent'] || '';
	const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
	const isAndroid = /Android/i.test(userAgent);

	const safeLat = lat || '';
	const safeLng = lng || '';
	const safeName = name || '';

	res.send(`
		<!DOCTYPE html>
		<html lang="ko">
		<head>
			<meta charset="utf-8" />
			<title>네이버 지도 열기</title>
			<meta name="viewport" content="width=device-width, initial-scale=1" />
			
			<script>
				var LAT = ${JSON.stringify(safeLat)};
				var LNG = ${JSON.stringify(safeLng)};
				var NAME = ${JSON.stringify(safeName)};
				var IS_IOS = ${isIOS ? 'true' : 'false'};
				var IS_ANDROID = ${isAndroid ? 'true' : 'false'};

				function openNaverMap() {
					var encodedName = encodeURIComponent(NAME || "");
					var appUrl = "nmap://route/car?dlat=" + LAT + "&dlng=" + LNG + "&dname=" + encodedName;

					// 네이버 지도 웹 (앱 없거나 앱 실행 실패 시)
					var webUrl = "https://map.naver.com/v5/directions/-/" + LNG + "," + LAT + "," + encodedName;

					var start = Date.now();

					window.location.href = appUrl;

					// 일정 시간 내에 앱이 안 열리면 웹으로 이동
					setTimeout(function() {
					var elapsed = Date.now() - start;
						if (elapsed < 1500) {
							window.location.href = webUrl;
						}
					}, 1200);
				}

				window.onload = openNaverMap;
			</script>
		</head>
		<body>
		</body>
		</html>`
	);
});





/* ===============================
 * 기본 함수들
 * =============================== */
 
function buildSimpleTextResponse(text) {
	return {
		version: '2.0',
		template: {
			outputs: [
				{
					simpleText: {
						text,
					},
				},
			],
		},
	};
}

function getParam(params, name, defaultValue) {
	const raw = params?.[name];

	if (raw == null) return defaultValue;

	if (typeof raw === 'string') return raw;           	// "CULTURAL_TEMPLE"
	if (typeof raw === 'object' && 'value' in raw) {	// { value: "CULTURAL_TEMPLE" }
		return raw.value;                           	
	}

	return defaultValue;
}

function buildNaverMapLauncherUrl(name, lat, lng) {
	const nName = name || '';
	const nLat = lat || '';
	const nLng = lng || '';

	const base = defURL + '/openmap';

	const params =
		'name=' + encodeURIComponent(nName) +
		'&lat=' + encodeURIComponent(nLat) +
		'&lng=' + encodeURIComponent(nLng);

	return `${base}?${params}`;
}

const normalizeText = (text) => text.replace(/\\n/g, "\n");



/* ===============================
 * 관광지 목록
 * =============================== */

async function getTouristSpots(regionCode, categoryCode) {
	console.log('[관광지목록] region:', regionCode, 'category:', categoryCode);
	const query = 
		`
			SELECT id, name_ko, summary, main_image_url, address, phone, homepage_Url
			FROM tourist_spots
			WHERE region_code = $1
			  AND category_code = $2
			  AND is_active = TRUE
			ORDER BY sort_order NULLS LAST, name_ko
			LIMIT 20;
		`;

	const values = [regionCode, categoryCode];
	const result = await pool.query(query, values);
	
	console.log('Spots Length =', result.rows);
	return result.rows;
}

function buildTouristSpotCarouselResponse(spots) {
	if (!spots || spots.length === 0) {
		return buildSimpleTextResponse('해당 카테고리의 관광지 정보를 찾지 못했어요 😢\n다른 유형을 선택해 주세요.');
	}

	// BasicCard 캐러셀 아이템 생성
	const items = spots.slice(0, 10).map(s => {
		// 설명 : 요약 + 주소
		const descLines = [];
		if (s.summary) descLines.push(s.summary);
		if (s.address) descLines.push(`📍 ${s.address}`);
		
		const description = descLines.join('\n');
		const naverMapUrl = buildNaverMapLauncherUrl(s.name_ko, s.latitude, s.longitude);
		const homepageUrl = s.homepage_url || naverMapUrl;

		const buttons = [];

		buttons.push({
			label: '웹페이지 보기',
			action: 'webLink',
			webLinkUrl: homepageUrl,
		});

		buttons.push({
			label: '네이버지도 경로',
			action: 'webLink',
			webLinkUrl: naverMapUrl,
		});

		if (s.phone) {
			buttons.push({
				label: '전화하기',
				action: 'phone',
				phoneNumber: s.phone,
			});
		}

		return {
			title: s.name_ko,
			description: description || '관광지 정보입니다.',
			thumbnail: { imageUrl: s.main_image_url || defImg, },
			buttons,
		};
	});

	return {
		version: '2.0',
		template: {
			outputs: [
				{
					carousel: {
						type: 'basicCard',
						items,
					},
				},
			],
			quickReplies: [
				{
					label: '처음으로',
					action: 'message',
					messageText: 'main',
				},
				{
					label: '다른 유형 보기',
					action: 'message',
					messageText: 'tourist_spots',
				},        
			],
		},
	};
}



/* ===============================
 * 시티투어 / 상설투어 프로그램
 * =============================== */
 
const TOUR_MAIN_IMAGE_URL = defURL + '/images/program_main.png';

async function getTourCourses(regionCode) {
	console.log('Tour Course Region Code:', regionCode);

	const text = `
		SELECT id, region_code, course_name, course_type, course_detail, course_image_url, sort_order
		FROM tour_courses
		WHERE region_code = $1
		  AND is_active = TRUE
		ORDER BY sort_order NULLS LAST, course_name;
	`;

	const values = [regionCode];
	console.log('Query values:', values);

	const result = await pool.query({ text, values });
	console.log('Row Count:', result.rowCount);

	return result.rows; 
}
  
function buildCityTourHeaderCard() {
	const title = '경산 시티투어 안내';
	const description =
		'경산 곳곳의 명소를 하루에 즐기는 관광버스 시티투어입니다 🚌\n\n' +
		'• 운영기간: 2025년 4월 17일 ~ 12월\n' +
		'• 출발장소: 임당역 5번 출구 전방 100M 버스정류장\n' +
		'가볍게 버스만 타고 따라오시면, 경산 구석구석을 안내해 드릴게요.';

	return {
		basicCard: {
			title,
			description,
			thumbnail: { imageUrl: TOUR_MAIN_IMAGE_URL, },
			buttons: [
				{
					label: '전화 예약',
					action: 'phone',
					phoneNumber: '053-819-0333', // 경산문화관광재단 축제관광팀
				},
				{
					label: '온라인 예약',
					action: 'webLink',
					webLinkUrl: 'https://gsctf.or.kr/',
				},
			],
		},
	};
}

function buildTourCourseListResponse(courses) {
	if (!courses || courses.length === 0) {
		return buildSimpleTextResponse(
			'현재 운영 중인 경산 시티투어 코스를 찾지 못했어요 😢\n' +
			'잠시 후 다시 시도해 주시거나, 경산문화관광재단으로 문의해 주세요.'
		);
	}

	const items = courses.slice(0, 10).map(c => {
		const descLines = [];

		if (c.course_type) descLines.push(`📝 코스 구분: ${c.course_type}`);
		if (c.course_detail) {
			const detail = normalizeText(c.course_detail);
			descLines.push(`🚌 코스 안내\n${detail}`);
		}
		
		const description = descLines.length > 0 ? descLines.join('\n') : '경산시티투어 코스입니다.';

		return {
			title: c.course_name,
			description,
			thumbnail: { imageUrl: c.course_image_url || TOUR_MAIN_IMAGE_URL, },
		};
	});

	return {
		version: '2.0',
		template: {
			outputs: [
				buildCityTourHeaderCard(),
				// 코스 목록 카드 캐러셀
				{
					carousel: {
						type: 'basicCard',
						items,
					},
				},
			],
			quickReplies: [
				{
					label: '처음으로',
					action: 'message',
					messageText: 'main',
				},
			],
		},
	};
}



/* ===============================
 * 관광지 목록
 * =============================== */

function buildParkingCarouselResponse(spots) {
	if (!spots || spots.length === 0) {
		return buildSimpleTextResponse('해당 카테고리의 관광지 정보를 찾지 못했어요 😢\n다른 유형을 선택해 주세요.');
	}

	// BasicCard 캐러셀 아이템 생성
	const items = spots.slice(0, 10).map(s => {
		// 설명 : 요약 + 주소
		const descLines = [];
		if (s.summary) descLines.push(s.summary);
		if (s.address) descLines.push(`📍 ${s.address}`);
		
		const description = descLines.join('\n');
		const naverMapUrl = buildNaverMapLauncherUrl(s.name_ko, s.latitude, s.longitude);
		const homepageUrl = s.homepage_url || naverMapUrl;

		const buttons = [];

		buttons.push({
			label: '웹페이지 보기',
			action: 'webLink',
			webLinkUrl: homepageUrl,
		});

		buttons.push({
			label: '네이버지도 경로',
			action: 'webLink',
			webLinkUrl: naverMapUrl,
		});

		if (s.phone) {
			buttons.push({
				label: '전화하기',
				action: 'phone',
				phoneNumber: s.phone,
			});
		}

		return {
			title: s.name_ko,
			description: description || '관광지 정보입니다.',
			buttons,
		};
	});

	return {
		version: '2.0',
		template: {
			outputs: [
				{
					carousel: {
						type: 'basicCard',
						items,
					},
				},
			],
			quickReplies: [
				{
					label: '처음으로',
					action: 'message',
					messageText: 'main',
				},
				{
					label: '다른 유형 보기',
					action: 'message',
					messageText: 'transport_info',
				},
			],
		},
	};
}



// 교통·편의 정보 목록 조회
async function getTransportInfo(regionCode, categoryCode) {
  const query = `
    SELECT id, name_ko, summary, main_image_url, address
    FROM transport_info
    WHERE region_code = $1
      AND category_code = $2
      AND is_active = TRUE
    ORDER BY sort_order NULLS LAST, name_ko
    LIMIT 5;
  `;
  const values = [regionCode, categoryCode];

  const result = await pool.query(query, values);
  return result.rows;
}

// 교통/편의 목록 응답
function buildTransportListResponse(items, categoryCode) {
  if (!items || items.length === 0) {
    return buildSimpleTextResponse(
      '해당 종류의 교통/편의 정보를 찾지 못했어요 😢\n' +
      '다른 메뉴를 선택해 주세요.'
    );
  }

  let text = '🚗 교통 및 편의 정보\n\n';
  items.forEach((i, idx) => {
    text += `${idx + 1}. ${i.name_ko}\n`;
    if (i.summary) text += `   - ${i.summary}\n`;
    if (i.address) text += `   📌 ${i.address}\n`;
    text += '\n';
  });

  return {
    version: '2.0',
    template: {
      outputs: [
        {
          simpleText: { text },
        },
      ],
      quickReplies: [
		{
          label: '처음으로',
          action: 'message',
          messageText: 'main',
        },
        {
          label: '주차장',
          action: 'message',
          messageText: '주차장 정보',
        },
        {
          label: '버스',
          action: 'message',
          messageText: '버스 정보',
        },
        {
          label: '관광안내소',
          action: 'message',
          messageText: '관광안내소 정보',
        },
        {
          label: '이동 동선',
          action: 'message',
          messageText: '이동 동선 알려줘',
        },
      ],
    },
  };
}



// FAQ 목록 조회
async function getFaqs(regionCode, categoryCode) {
  // category_code가 없으면 지역 공통 FAQ 전체
  let query = `
    SELECT id, question, answer
    FROM faqs
    WHERE is_active = TRUE
      AND (region_code = $1 OR region_code IS NULL)
  `;
  const values = [regionCode];

  if (categoryCode) {
    query += ` AND category_code = $2`;
    values.push(categoryCode);
  }

  query += ` ORDER BY sort_order NULLS LAST, id LIMIT 5;`;

  const result = await pool.query(query, values);
  return result.rows;
}

// FAQ 응답
function buildFaqListResponse(faqs) {
  if (!faqs || faqs.length === 0) {
    return buildSimpleTextResponse(
      '등록된 자주 묻는 질문이 아직 없어요 😅\n' +
      '궁금한 내용을 직접 입력해 주세요.'
    );
  }

  let text = '🙋 자주 묻는 질문\n\n';
  faqs.forEach((f, idx) => {
    text += `${idx + 1}. Q. ${f.question}\n`;
    text += `   A. ${f.answer}\n\n`;
  });

  return {
    version: '2.0',
    template: {
      outputs: [
        {
          simpleText: { text },
        },
      ],
      quickReplies: [
        {
          label: '관광지 안내',
          action: 'message',
          messageText: '관광지 안내',
        },
        {
          label: '시티투어',
          action: 'message',
          messageText: '시티투어 안내',
        },
        {
          label: '교통 정보',
          action: 'message',
          messageText: '교통 정보',
        },
      ],
    },
  };
}





/* ===============================
 * Render환경용 포트 설정
 * =============================== */
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});