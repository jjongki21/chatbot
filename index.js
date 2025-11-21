const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // ※ Render Postgres 기본 설정
  },
});

const defImg = 'https://example.com/default_tour_image.jpg';

app.get('/', (req, res) => {
  res.send('Kakao Chatbot is running.');
});

console.log('Connection Running');

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
			
			case 'tour_programs_list_city': {
				const programTypeCode = 'CITY_TOUR';
				const programs = await getTourPrograms(regionCode, programTypeCode);
				kakaoResponse = buildTourProgramListResponse(programs, programTypeCode);
				break;
			}
			case 'tour_programs_list_luxury': {
				const programTypeCode = 'LUXURY_TOUR';
				const programs = await getTourPrograms(regionCode, programTypeCode);
				kakaoResponse = buildTourProgramListResponse(programs, programTypeCode);
				break;
			}
			case 'tour_programs_list_wish': {
				const programTypeCode = 'WISH_TOUR';
				const programs = await getTourPrograms(regionCode, programTypeCode);
				kakaoResponse = buildTourProgramListResponse(programs, programTypeCode);
				break;
			}
			case 'tour_programs_list_scholar': {
				const programTypeCode = 'SCHOLAR_TOUR';
				const programs = await getTourPrograms(regionCode, programTypeCode);
				kakaoResponse = buildTourProgramListResponse(programs, programTypeCode);
				break;
			}


				  

				  case '교통편의_목록': {
					const categoryCode = getParam(params, 'category_code', 'PARKING');
					console.log('[교통편의_목록] region:', regionCode, 'category:', categoryCode);

					const items = await getTransportInfo(regionCode, categoryCode);
					console.log('items.length =', items.length);

					kakaoResponse = buildTransportListResponse(items, categoryCode);
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
 * 기본 함수들
 * =============================== */
 
// 단순 텍스트 응답
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

function buildNaverMapUrl(spot) {
  const keyword = spot.address
    ? `${spot.name_ko} ${spot.address}`
    : spot.name_ko;

  const encoded = encodeURIComponent(keyword);
  return `https://map.naver.com/v5/search/${encoded}`;
}



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
			LIMIT 5;
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

		// 네이버 지도 URL
		const naverMapUrl = buildNaverMapUrl(s);
		
		// 웹페이지 URL (없으면 네이버 지도나 기본 페이지로 대체)
		const homepageUrl = s.homepage_url || naverMapUrl;

		const buttons = [];

		// 1) 웹페이지 링크 버튼
		buttons.push({
			label: '웹페이지 보기',
			action: 'webLink',
			webLinkUrl: homepageUrl,
		});

		// 2) 네이버지도 경로 버튼
		buttons.push({
			label: '네이버지도 경로',
			action: 'webLink',
			webLinkUrl: naverMapUrl,
		});

		// 3) 연락처 버튼 (전화가 있을 때만)
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
					messageText: '처음으로',
				},
				{
					label: '다른 유형 보기',
					action: 'message',
					messageText: '관광지 안내',
				},        
			],
		},
	};
}




/* ===============================
 * 시티투어 / 상설투어 프로그램
 * =============================== */
 
async function getTourPrograms(regionCode, programTypeCode) {
	console.log('[투어프로그램목록] region:', regionCode, 'program:', programTypeCode);
	const query = 
		`
		    SELECT id, name_ko, summary, description, route_description, duration, schedule_info,
				   meeting_point, price, reservation_info, main_image_url, homepage_url, tags, sort_order
			FROM tour_programs
			WHERE region_code = $1
			  AND program_type_code = $2
			  AND is_active = TRUE
			ORDER BY sort_order NULLS LAST, name_ko
			LIMIT 10;
		`;

	const values = [regionCode, programTypeCode];
	const result = await pool.query(query, values);
	
	console.log('Programs Length =', result.rows);
	return result.rows;
}

function buildTourProgramListResponse(programs, programTypeCode) {
	if (!programs || programs.length === 0) {
		return buildSimpleTextResponse(
			'해당 종류의 투어 프로그램 정보를 찾지 못했어요 😢\n다른 투어를 선택해 주세요.'
		);
	}
	
	const items = programs.slice(0, 10).map(p => {
		const descLines = [];
		
		if (p.summary) descLines.push(p.summary);
		if (p.duration) descLines.push(`⏱ 소요시간: ${p.duration}`);
		if (p.schedule_info) descLines.push(`🕒 운영: ${p.schedule_info}`);
		if (p.meeting_point) descLines.push(`📍 출발: ${p.meeting_point}`);

		const description = descLines.length > 0 ? descLines.join('\n') : `${typeLabel} 프로그램입니다.`;

		const buttons = [];

		// 웹페이지 보기
		if (p.homepage_url) {
			buttons.push({
				label: '웹페이지 보기',
				action: 'webLink',
				webLinkUrl: p.homepage_url,
			});
		}

		// 전화 문의
		if (p.reservation_info && /[0-9]{2,4}-[0-9]{3,4}-[0-9]{4}/.test(p.reservation_info)) {
		// 예약 안내문 안에 전화번호가 섞여 있을 수도 있어서, 정규식으로 추출
			const phoneMatch = p.reservation_info.match(/[0-9]{2,4}-[0-9]{3,4}-[0-9]{4}/);
			if (phoneMatch) {
				buttons.push({
					label: '전화 문의',
					action: 'phone',
					phoneNumber: phoneMatch[0],
				});
			}
		}

		// 버튼이 하나도 없으면, 안내용 버튼 하나라도 추가
		if (buttons.length === 0) {
			buttons.push({
				label: '상세 안내 문의',
				action: 'message',
				messageText: `${typeLabel} 문의`,
			});
		}

		return {
			title: p.name_ko,
			description,
			thumbnail: { imageUrl: p.main_image_url || defImg, },
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
					messageText: '처음으로',
				},
				{
					label: '다른 투어 보기',
					action: 'message',
					messageText: '시티투어/상설투어 프로그램',
				},
			],
		},
	};
}








// 교통/편의 정보 목록 조회
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
          messageText: '처음으로',
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