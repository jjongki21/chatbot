const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');

const defURL = 'https://yktout-chatbot-web.onrender.com';
const defImg = `${defURL}/images/kyeongsan_m_1_info.png`;

console.log(defImg);

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
 * 카카오톡 챗봇 연동 클래스 : 오픈빌더에서의 블록명, 발화와 내용 통일 할 것
 * =============================== */
 
class BlockInfo {
	constructor(menu, blockName, category = '', utterances = []) {
		this.menu = menu;				// 하단에서 처리할 메뉴 (고정)
		this.blockName = blockName;     // 블록명
		this.category = category;       // 카테고리
		this.utterances = utterances;   // 사용자 발화 배열
	}
}

const BlockList = [
	new BlockInfo('MAIN',				'main', 							'MAIN', 				['처음으로', '시작', '처음']),
	new BlockInfo('TOUR_MAIN',			'tourist_spots', 					'TOUR_MAIN', 			['관광지 안내', '관광', '관광지', '관광지 안내 해줘']),
	new BlockInfo('TOUR_CULTURE',		'tourist_spots_list_culture', 		'CULTURAL_TEMPLE', 		['문화유적/사찰', '문화유적', '사찰']),
	new BlockInfo('TOUR_NATURE',		'tourist_spots_list_nature', 		'NATURE_WALK', 			['산책명소/자연경관', '산책명소', '자연경관']),
	new BlockInfo('TOUR_FESTIVAL',		'tourist_spots_list_festival', 		'FESTIVAL_ACTIVITY', 	['축제/체험/볼거리', '축제', '체험', '볼거리']),
	new BlockInfo('PROGRAMS',			'tour_programs_list', 				'PROGRAMS', 			['투어 프로그램', '투어 프로그램 알려줘', '투어']),
	new BlockInfo('TRANSPORT',			'transport_info', 					'TRANSPORT', 			['교통편의정보', '교통 및 편의 정보 알려줘', '편의정보', '교통정보']),
	new BlockInfo('TRANS_PARKING',		'transport_info_list_parking', 		'PARKING', 				['주차장 정보', '주차장', '주차장 알려줘']),
	new BlockInfo('TRANS_CENTER',		'transport_info_list_center', 		'INFORMATION', 			['관광안내소 정보', '관광안내소', '관광안내소 알려줘']),
	new BlockInfo('TRANS_ROUTE',		'transport_info_list_route', 		'ROUTE', 				['이동동선', '이동동선 알려줘']),
	new BlockInfo('TRANS_BUS',			'transport_info_list_bus', 			'BUS', 					['버스정보', '버스', '버스정보 알려줘']),
	new BlockInfo('TRANS_BUS_EDGE',		'transport_info_list_bus_edge', 	'EDGE', 				['간선버스', '간선', '간선버스 알려줘']),
	new BlockInfo('TRANS_BUS_LOOP',		'transport_info_list_bus_loop', 	'LOOP', 				['순환버스', '순환', '순환버스 알려줘']),
	new BlockInfo('TRANS_BUS_BRANCH',	'transport_info_list_bus_branch', 	'BRANCH', 				['지선버스', '지선', '지선버스 알려줘']),
	new BlockInfo('TRANS_BUS_DETAIL',	'transport_info_list_detail', 		'BUS_DETAIL', 			['버스상세']),
	new BlockInfo('QNA_MAIN',			'qna', 								'QNA_MAIN', 			['자주 묻는 질문', '질문']),
];

function getBlockByName(blockName) {
	return BlockList.find(b => b.blockName === blockName) || null;
}

function getBlockByMenu(menuName) {
	return BlockList.find(b => b.menu === menuName) || null;
}

function FirstUtterance(menuName) {
	const info = getBlockByMenu(menuName);
	
	if (!info || !Array.isArray(info.utterances) || info.utterances.length === 0) {
		console.warn('[safeFirstUtterance] fallback used for', menuName);
		return '';
	}
	return String(info.utterances[0]);
}
 

/* ===============================
 * 카카오톡 챗봇 웹훅
 * =============================== */

app.post('/kakao/webhook', async (req, res) => {
	try {
		const body = req.body;
		const intentName = body.intent?.name || '';		//intent Name은 오픈빌더에서의 블록명
		const params = body.action?.params || {};

		console.log('intentName:', intentName);
		console.log('raw params:', JSON.stringify(params, null, 2));

		const regionCode = getParam(params, 'region_code', 'gyeongsan');
		const block = getBlockByName(intentName);

		let kakaoResponse;
				
		switch (block.menu) {
			// ※ 메인 (처음으로)
			case 'MAIN': {
				kakaoResponse = buildMainMenuResponse(regionCode);
				break;
			}

			// ※ 관광지 안내
			case 'TOUR_MAIN': {
				kakaoResponse = buildTouristSpotsMenuResponse(regionCode);
				break;
			}
			//    └ 문화유적/사찰
			case 'TOUR_CULTURE': {
				const spots = await getTouristSpots(regionCode, block.category);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, block.category);
				break;
			}
			//    └ 자연경관/산책명소
			case 'TOUR_NATURE': {
				const spots = await getTouristSpots(regionCode, block.category);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, block.category);
				break;
			}
			//    └ 축제/체험/볼거리
			case 'TOUR_FESTIVAL': {
				const spots = await getTouristSpots(regionCode, block.category);
				kakaoResponse = buildTouristSpotCarouselResponse(spots, block.category);
				break;
			}
			
			// ※ 시티투어 상설투어 프로그램
			case 'PROGRAMS': {
				const courses = await getTourCourses(regionCode);
				kakaoResponse = buildTourCourseCarouseResponse(regionCode, courses);
				break;
			}
			
			// ※ 교통 및 편의정보
			case 'TRANSPORT': {
				kakaoResponse = buildTransportInfoMenuResponse(regionCode);
				break;
			}
			//    └ 주차장
			case 'TRANS_PARKING': {
				const spots = await getTouristSpots(regionCode, block.category);
				kakaoResponse = buildParkingCarouselResponse(spots, block.category);
				break;
			}
			//    └ 관광안내소
			case 'TRANS_CENTER': {
				const spots = await getTouristSpots(regionCode, block.category);
				kakaoResponse = buildParkingCarouselResponse(spots, block.category);
				break;
			}			
			//    └ 버스
			case 'TRANS_BUS': {
				kakaoResponse = buildBusMenuResponse(regionCode);
				break;
			}
			//       └ 버스-간선
			case 'TRANS_BUS_EDGE': {
				const routeNumbers = await getBusRouteNumbersByType(regionCode, block.category);
				kakaoResponse = buildBusRouteQuickReplies(routeCode, routeNumbers);
				break;
			}
			//       └ 버스-순환선
			case 'TRANS_BUS_LOOP': {
				const routeNumbers = await getBusRouteNumbersByType(regionCode, block.category);
				kakaoResponse = buildBusRouteQuickReplies(routeCode, routeNumbers);
				break;
			}
			//       └ 버스-지선
			case 'TRANS_BUS_BRANCH': {
				const routeNumbers = await getBusRouteNumbersByType(regionCode, block.category);
				kakaoResponse = buildBusRouteQuickReplies(routeCode, routeNumbers);
				break;
			}
			//       └ 버스 상세 정보
			case 'TRANS_BUS_DETAIL': {
				/*let routeNumber = getParam(params, 'route_number', null);
				if (!routeNumber && body.userRequest && body.userRequest.utterance) {
					routeNumber = body.userRequest.utterance.trim();
				}
				console.log('[transport_info_list_bus_detail] region:', regionCode, 'routeNumber:', routeNumber);

				if (!routeNumber) {
					kakaoResponse = buildSimpleTextResponse(
						'조회할 버스 번호를 찾지 못했어요 😢\n버스 번호를 다시 한 번 눌러 주세요.');
					break;
				}

				const route = await getBusRouteDetail(regionCode, routeNumber);
				kakaoResponse = buildBusRouteDetailResponse(route);*/
				break;
			}
			//    └ 이동경로
			case 'TRANS_ROUTE': {
				break;
			}
			
			
			
				  case 'QNA_MAIN': {
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
					'요청하신 내용을 이해하기가 조금 어려워요 😅\n메뉴에서 관광지 안내, 시티투어, 교통정보, FAQ 중 하나를 다시 선택해 주세요.'
				);
			}
		}

		res.json(kakaoResponse);
	} catch (err) {
		console.error('Kakao Webhook Error:', err);
		const errorResponse = buildSimpleTextResponse('잠시 시스템 오류가 발생했어요 😥\n잠시 후 다시 시도해 주세요.');
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
		template: { outputs: [ { simpleText: { text, }, }, ], },
	};
}

function getParam(params, name, defaultValue) {
	const raw = params?.[name];

	if (raw == null) return defaultValue;

	if (typeof raw === 'string') return raw;           	// 'CULTURAL_TEMPLE'
	if (typeof raw === 'object' && 'value' in raw) {	// { value: 'CULTURAL_TEMPLE' }
		return raw.value;                           	
	}

	return defaultValue;
}

function buildNaverMapLauncherUrl(name, lat, lng) {
	const nName = name || '';
	const nLat = lat || '';
	const nLng = lng || '';

	const base = `${defURL}/openmap`;

	const params =
		'name=' + encodeURIComponent(nName) +
		'&lat=' + encodeURIComponent(nLat) +
		'&lng=' + encodeURIComponent(nLng);

	return `${base}?${params}`;
}

const normalizeText = (text) => text.replace(/\\n/g, "\n");


function buildMainMenuResponse(regionCode) {
	//if (regionCode === 'gyeongsan') {
		return {
			version: '2.0',
			template: {
				outputs: [
					{
						carousel: {
							type: 'basicCard',
							items: [
								// 1) 관광지 안내
								{
									title: '관광지 안내',
									description: '문화유적·자연명소·축제 정보를 한눈에!',
									thumbnail: {
										imageUrl: `${defURL}/images/kyeongsan_m_1_info.png`,
									},
									buttons: [
										{
											label: '관광지 보러가기',
											action: 'message',
											messageText: FirstUtterance('TOUR_MAIN'),
										},
									],
								},
								// 2) 투어 프로그램 안내
								{
									title: '투어 프로그램 안내',
									description: '테마별 여행 코스를 편하게 즐겨보세요!',
									thumbnail: {
										imageUrl: `${defURL}/images/kyeongsan_m_2_tour.png`,
									},
									buttons: [
										{
											label: '투어 프로그램 보러가기',
											action: 'message',
											messageText: FirstUtterance('PROGRAMS'),
										},
									],
								},
								// 3) 교통 · 편의 정보
								{
									title: '교통·편의정보',
									description: '주차장·버스·안내소 위치를 쉽게 찾아보세요.',
									thumbnail: {
										imageUrl: `${defURL}/images/kyeongsan_m_3_traffic.png`,
									},
									buttons: [
										{
											label: '교통·편의정보 보러가기',
											action: 'message',
											messageText: FirstUtterance('TRANSPORT'),
										},
									],
								},
								// 4) 자주 묻는 질문
								{
									title: '자주 묻는 질문',
									description: '여행 중 자주 물어보는 정보를 모았어요.',
									thumbnail: {
										imageUrl: `${defURL}/images/kyeongsan_m_4_faq.png`,
									},
									buttons: [
										{
											label: '자주 묻는 질문 보러가기',
											action: 'message',
											messageText: FirstUtterance('QNA_MAIN'),
										},
									],
								},
							],
						},
					},
				],
				quickReplies: [
					{
						label: '처음으로',
						action: 'message',
						messageText: FirstUtterance('MAIN'),
					},
				],
			},
		};
	//}
}



/* ===============================
 * 관광지 목록
 * =============================== */
 
function buildTouristSpotsMenuResponse(regionCode) {
	//if (regionCode === 'gyeongsan') {
		const text = '경산의 명소들을 소개해드릴게요!\n원하시는 관광지 유형을 선택해 주세요 👇';

		return {
			version: '2.0',
			template: {
				outputs: [
					{
						basicCard: {
							description: text,
							buttons: [
								{
									label: '문화유적/사찰',
									action: 'message',
									messageText: FirstUtterance('TOUR_CULTURE'),
								},
								{
									label: '자연경관/산책명소',
									action: 'message',
									messageText: FirstUtterance('TOUR_NATURE'),
								},
								{
									label: '축제·체험·볼거리',
									action: 'message',
									messageText: FirstUtterance('TOUR_FESTIVAL'),
								},
							],
						},
					},
				],
				quickReplies: [
					{
						label: '처음으로',
						action: 'message',
						messageText: FirstUtterance('MAIN'),
					},
				],
			},
		};
	//}
}

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

	const items = spots.slice(0, 10).map(s => {
		const descLines = [];
		if (s.summary) descLines.push(s.summary);
		if (s.address) descLines.push(`📍 ${s.address}`);
		
		const description = descLines.join('\n');
		const naverMapUrl = buildNaverMapLauncherUrl(s.name_ko, s.latitude, s.longitude);
		
		const buttons = [];

		if (s.homepage_url) {
			buttons.push({
				label: '웹페이지 보기',
				action: 'webLink',
				webLinkUrl: s.homepage_url,
			});
		}

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
					messageText: FirstUtterance('MAIN'),
				},
				{
					label: '다른 유형 보기',
					action: 'message',
					messageText: FirstUtterance('TOUR_MAIN'),
				},        
			],
		},
	};
}



/* ===============================
 * 시티투어 / 상설투어 프로그램
 * =============================== */
 
const TOUR_MAIN_IMAGE_URL = `${defURL}/images/program_main.png`;

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
  
function buildCityTourResponse(regionCode) {
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
					phoneNumber: '053-819-0333',
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

function buildTourCourseCarouseResponse(regionCode, courses) {
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
				buildCityTourResponse(regionCode),
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
					messageText: FirstUtterance('MAIN'),
				},
			],
		},
	};
}



/* ===============================
 * 교통 및 편의정보 목록
 * =============================== */
 
function buildTransportInfoMenuResponse(regionCode) {
	//if (regionCode === 'gyeongsan') {
		const text = '이동이 편한 경산 여행! 어디든 도와드릴게요 🚆🚌\n필요한 정보를 선택해 주세요 👇';

		return {
			version: '2.0',
			template: {
				outputs: [
					{
						basicCard: {
							description: text,
						},
					},
				],
				quickReplies: [
					{
						label: '처음으로',
						action: 'message',
						messageText: FirstUtterance('MAIN'),
					},
					{
						label: '주차장',
						action: 'message',
						messageText: FirstUtterance('TRANS_PARKING'),
					},
					{
						label: '버스',
						action: 'message',
						messageText: FirstUtterance('TRANS_BUS'),
					},
					{
						label: '관광안내소',
						action: 'message',
						messageText: FirstUtterance('TRANS_CENTER'),
					},
					{
						label: '이동동선',
						action: 'message',
						messageText: FirstUtterance('TRANS_ROUTE'),
					},
				],
			},
		};
	//}
}

function buildParkingCarouselResponse(spots) {
	if (!spots || spots.length === 0) {
		return buildSimpleTextResponse('해당 카테고리의 정보를 찾지 못했어요 😢\n다른 유형을 선택해 주세요.');
	}

	const items = spots.slice(0, 10).map(s => {
		const descLines = [];
		if (s.summary) descLines.push(s.summary);
		if (s.address) descLines.push(`📍 ${s.address}`);
		
		const description = descLines.join('\n');
		const naverMapUrl = buildNaverMapLauncherUrl(s.name_ko, s.latitude, s.longitude);
		
		const buttons = [];

		if (s.homepageUrl) {
			buttons.push({
				label: '웹페이지 보기',
				action: 'webLink',
				webLinkUrl: s.homepage_url,
			});
		}

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

		if (s.main_image_url) {
			return {
				title: s.name_ko,
				description: description || '교통 및 편의정보입니다.',
				thumbnail: { imageUrl: s.main_image_url || defImg, },
				buttons,
			};
		}
		else {
			return {
				title: s.name_ko,
				description: description || '교통 및 편의정보입니다.',
				buttons,
			};
		}
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
					messageText: FirstUtterance('MAIN'),
				},
				{
					label: '다른 유형 보기',
					action: 'message',
					messageText: FirstUtterance('TRANSPORT'),
				},        
			],
		},
	};
}

function getBusRouteTypeLabel(routeType) {
	switch (routeType) {
		case 'EDGE': 	return '간선버스';
		case 'LOOP': 	return '순환버스';
		case 'BRANCH':	return '지선버스';
		default:		return '버스';
	}
}

function buildBusMenuResponse(regionCode) {
	const text = '경산 시내버스 정보를 안내해 드릴게요 🚌\n원하시는 노선 유형을 선택해 주세요 👇';
	
	return {
		version: '2.0',
		template: {
			outputs: [
				{
					simpleText: { text, },
				},
			],
			quickReplies: [
				{
					label: '처음으로',
					action: 'message',
					messageText: FirstUtterance('MAIN'),
				},
				{
					label: '간선',
					action: 'message',
					messageText: FirstUtterance('TRANS_BUS_EDGE'),
				},
				{
					label: '순환선',
					action: 'message',
					messageText: FirstUtterance('TRANS_BUS_LOOP'),
				},
				{
					label: '지선',
					action: 'message',
					messageText: FirstUtterance('TRANS_BUS_BRANCH'),
				},
			],
		},
	};
}

async function getBusRouteNumbersByType(regionCode, routeType) {
	console.log('▶ getBusRouteNumbersByType()', regionCode, routeType);

	const text = `
		SELECT DISTINCT route_number
			FROM bus_routes
			WHERE region_code = $1
			  AND route_type = $2
			  AND is_active = TRUE
			ORDER BY route_number;
		`;
	
	const values = [regionCode, routeType];
	const result = await pool.query({ text, values });
	console.log('  rowCount =', result.rowCount);

	return result.rows.map(r => r.route_number);
}

async function getBusRouteDetail(regionCode, routeNumber) {
	console.log('▶ getBusRouteDetail()', regionCode, routeNumber);

	const text = `
		SELECT id, region_code, route_number, route_type, origin_name, destination_name,
			   interval_info, first_bus_time, last_bus_time, weekday_timetable_url, holiday_timetable_url,
			   route_map_url, sort_order
			FROM bus_routes
			WHERE region_code = $1
			  AND route_number = $2
			  AND is_active = TRUE
			LIMIT 1;
		`;
		
	const values = [regionCode, routeNumber];
	const result = await pool.query({ text, values });
	console.log('  rowCount =', result.rowCount);

	return result.rows[0] || null;
}

function buildBusRouteQuickReplies(routeType, routeNumbers) {
	const typeLabel = getBusRouteTypeLabel(routeType);

	if (!routeNumbers || routeNumbers.length === 0) {
		return buildSimpleTextResponse(`${typeLabel} 정보를 찾지 못했어요 😢\n다른 노선을 선택해 주세요.`);
	}

	const quickReplies = routeNumbers.map(num => ({
		label: num,
		action: 'message',
		messageText: num,
	}));

	return {
		version: '2.0',
		template: {
			outputs: [
				{
					simpleText: {
						text: `${typeLabel} 노선을 선택해 주세요.\n원하시는 버스 번호를 누르시면 상세 정보를 안내해 드릴게요.`,
					},
				},
			],
			quickReplies: [
				...quickReplies,
				{
					label: '처음으로',
					action: 'message',
					messageText: FirstUtterance('MAIN'),
				},
			],
		},
	};
}

function buildBusRouteDetailResponse(route) {
	if (!route) {
		return buildSimpleTextResponse('해당 버스 노선 정보를 찾지 못했어요 😢\n번호를 다시 한 번 확인해 주세요.');
	}

	const typeLabel = getBusRouteTypeLabel(route.route_type);
	
	const descLines = [];
	descLines.push(`노선번호: ${route.route_number} (${typeLabel})`);
	descLines.push(`출발지: ${route.origin_name}`);
	descLines.push(`도착지: ${route.destination_name}`);

	if (route.interval_info) descLines.push(`배차간격: ${route.interval_info}`);
	if (route.first_bus_time || route.last_bus_time) {
		descLines.push(`첫차/막차: ${route.first_bus_time || '-'} ~ ${route.last_bus_time || '-'}`);
	}

	const description = descLines.join('\n');
	
	const buttons = [];
	if (route.weekday_timetable_url) {
		buttons.push({
			label: '평일 시간표',
			action: 'webLink',
			webLinkUrl: route.weekday_timetable_url,
		});
	}

	if (route.holiday_timetable_url) {
		buttons.push({
			label: '주말/공휴일 시간표',
			action: 'webLink',
			webLinkUrl: route.holiday_timetable_url,
		});
	}

	if (route.route_map_url) {
		buttons.push({
			label: '노선도 보기',
			action: 'webLink',
			webLinkUrl: route.route_map_url,
		});
	}

	if (buttons.length === 0) {
		buttons.push({
			label: '다른 노선 보기',
			action: 'message',
			messageText: '버스정보',
		});
	}

	return {
		version: '2.0',
		template: {
			outputs: [
				{
					basicCard: {
						title: `${route.route_number}번`,
						description,
						thumbnail: {
							imageUrl: `${defURL}/images/kyeongsan_m_3_traffic.png`,
						},
						buttons,
					},
				},
			],
			quickReplies: [
				{
					label: '처음으로',
					action: 'message',
					messageText: FirstUtterance('MAIN'),
				},
				{
					label: '간선버스',
					action: 'message',
					messageText: FirstUtterance('TRANS_BUS_EDGE'),
				},
				{
					label: '순환버스',
					action: 'message',
					messageText: FirstUtterance('TRANS_BUS_LOOP'),
				},
				{
					label: '지선버스',
					action: 'message',
					messageText: FirstUtterance('TRANS_BUS_BRANCH'),
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