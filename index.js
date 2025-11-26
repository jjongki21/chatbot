const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');

//Render Web service URL
const defURL = 'https://yktout-chatbot-web.onrender.com';
const defImgURL = `${defURL}/images/`;

const defImg = `${defImgURL}kyeongsan_m_1_info.png`;

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

//  		| index.js에서 사용할 대행 문구 | 오픈빌더의 블록명					| DB에서 사용할 카테고리명	| 오픈빌더의 블록에서 사용중인 사용자 발화 리스트			|
//			| 변경시 index.js 수정 필요	| 오픈빌더에 맞춰 수정					| 변경시 DB 수정 필요		| 오픈빌더에 맞춰 수정									|

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
	new BlockInfo('TRANS_ROUTE_THEME',	'transport_info_list_route_theme', 	'THEME', 				['테마형 이동동선', '테마형']),
	new BlockInfo('TRANS_ROUTE_HUB',	'transport_info_list_route_hub', 	'HUB', 					['출발지기준 동선', '출발지기준']),
	new BlockInfo('TRANS_ROUTE_COURSE',	'transport_info_list_route_course', 'COURSE', 				['코스형 이동동선', '코스형']),
	new BlockInfo('TRANS_BUS',			'transport_info_list_bus', 			'BUS', 					['버스정보', '버스', '버스정보 알려줘']),
	new BlockInfo('TRANS_BUS_EDGE',		'transport_info_list_bus_edge', 	'EDGE', 				['간선버스', '간선', '간선버스 알려줘']),
	new BlockInfo('TRANS_BUS_LOOP',		'transport_info_list_bus_loop', 	'LOOP', 				['순환버스', '순환', '순환버스 알려줘']),
	new BlockInfo('TRANS_BUS_BRANCH',	'transport_info_list_bus_branch', 	'BRANCH', 				['지선버스', '지선', '지선버스 알려줘']),
	new BlockInfo('TRANS_BUS_DETAIL',	'transport_info_list_bus_detail', 	'BUS_DETAIL', 			['']),
	new BlockInfo('QNA_MAIN',			'qna_list', 						'QNA_MAIN', 			['자주 묻는 질문']),
	new BlockInfo('QNA_TOUR',			'qna_list_tour', 					'QNA_TOUR', 			['관광지 질문']),
	new BlockInfo('QNA_TRANSPORT',		'qna_list_transport', 				'QNA_TRANSPORT', 		['교통편의 질문']),
	new BlockInfo('QNA_PROGRAM',		'qna_list_program', 				'QNA_PROGRAM', 			['투어 프로그램 질문']),
	new BlockInfo('QNA_FESTIVAL',		'qna_list_festival', 				'QNA_FESTIVAL', 		['축제행사 질문']),
	new BlockInfo('QNA_SEARCH',			'qna_list_search', 					'QNA_SEARCH', 			['질문할게 있어']),	// 질문 검색인데 귀찮아서 뺌
];

function getBlockByName(blockName) {
	return BlockList.find(b => b.blockName === blockName) || null;
}

// 블록의 첫번째 사용자발화 가져오기 (사용자발화로 블록 이동하기 위한 용도)
function getFirstUtterance(menuName) {
	const info = BlockList.find(b => b.menu === menuName) || null;
	
	if (!info || !Array.isArray(info.utterances) || info.utterances.length === 0) {
		console.warn('Fallback used for ', menuName);
		return '';
	}
	return String(info.utterances[0]);
}

// Enum - 버스노선 타입별 명칭
function getBusRouteTypeLabel(routeType) {
	switch (routeType) {
		case 'EDGE': 	return '간선버스';
		case 'LOOP': 	return '순환버스';
		case 'BRANCH':	return '지선버스';
		default:		return '버스';
	}
}

// Enum - 이동동선 타입별 명칭
function getTravelRouteTypeLabel(routeType) {
	switch (routeType) {
		case 'THEME': 	return '테마형 이동 동선';
		case 'HUB':		return '출발지(허브) 기준 동선';
		case 'COURSE':	return '반나절/1일 코스';
		default:		return '이동 동선';
	}
}

// Enum - 질문 카테고리별 명칭
function getFaqCategoryLabel(categoryCode) {
	switch (categoryCode) {
		case 'QNA_TOUR':		return '관광 정보 안내';
		case 'QNA_TRANSPORT':	return '교통 및 주차 안내';
		case 'QNA_PROGRAM':		return '시티투어 · 투어 프로그램 안내';
		case 'QNA_FESTIVAL':	return '축제 · 행사 안내';
		default:				return categoryCode;
	}
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
				kakaoResponse = buildBusRouteMenuResponse(regionCode);
				break;
			}
			//       └ 버스-간선
			case 'TRANS_BUS_EDGE': {
				const routeNumbers = await getBusRouteNumbersByType(regionCode, block.category);
				kakaoResponse = buildBusRouteQuickReplies(block.category, routeNumbers);
				break;
			}
			//       └ 버스-순환선
			case 'TRANS_BUS_LOOP': {
				const routeNumbers = await getBusRouteNumbersByType(regionCode, block.category);
				kakaoResponse = buildBusRouteQuickReplies(block.category, routeNumbers);
				break;
			}
			//       └ 버스-지선
			case 'TRANS_BUS_BRANCH': {
				const routeNumbers = await getBusRouteNumbersByType(regionCode, block.category);
				kakaoResponse = buildBusRouteQuickReplies(block.category, routeNumbers);
				break;
			}
			//       └ 버스 상세 정보
			case 'TRANS_BUS_DETAIL': {
				let routeNumber = getParam(params, 'route_number', null);
				
				if (!routeNumber && body.userRequest && body.userRequest.utterance) {
					routeNumber = body.userRequest.utterance.trim();
				}

				const route = await getBusRouteDetail(regionCode, routeNumber);
				kakaoResponse = buildBusRouteDetailResponse(route);
				break;
			}
			//    └ 이동경로
			case 'TRANS_ROUTE': {
				kakaoResponse = buildTravelRouteMenuResponse(regionCode);
				break;
			}
			//       └ 이동경로 - 테마형
			case 'TRANS_ROUTE_THEME': {
				const routes = await getTravelRoutes(regionCode, block.category);
				kakaoResponse = buildTravelRouteListResponse(routes, block.category);
				break;
			}
			//       └ 이동경로 - 출발지기준
			case 'TRANS_ROUTE_HUB': {
				const routes = await getTravelRoutes(regionCode, block.category);
				kakaoResponse = buildTravelRouteListResponse(routes, block.category);
				break;
			}
			//       └ 이동경로 - 코스형
			case 'TRANS_ROUTE_COURSE': {
				const routes = await getTravelRoutes(regionCode, block.category);
				kakaoResponse = buildTravelRouteListResponse(routes, block.category);
				break;
			}
						
			// ※ 자주 하는 질문
			case 'QNA_MAIN': {
				const categories = await getFaqCategories(regionCode);
				kakaoResponse = buildFaqCategoryListResponse(categories);
				break;
			}
			//    └ 관광지 질문
			case 'QNA_TOUR': {
				console.log('QNA_TOUR', block.category);
				const faqs = await getFaqsByCategory(regionCode, block.category);
				kakaoResponse = buildFaqListResponse(block.category, faqs);
				break;
			}
			//    └ 교통편의 질문
			case 'QNA_TRANSPORT': {
				const faqs = await getFaqsByCategory(regionCode, block.category);
				kakaoResponse = buildFaqListResponse(block.category, faqs);
				break;
			}
			//    └ 투어 프로그램 질문
			case 'QNA_PROGRAM': {
				const faqs = await getFaqsByCategory(regionCode, block.category);
				kakaoResponse = buildFaqListResponse(block.category, faqs);
				break;
			}
			//    └ 투어 프로그램 질문
			case 'QNA_FESTIVAL': {
				const faqs = await getFaqsByCategory(regionCode, block.category);
				kakaoResponse = buildFaqListResponse(block.category, faqs);
				break;
			}
			//    └ 커스텀 질문
			case 'QNA_SEARCH': {
				const userText = body.userRequest && body.userRequest.utterance
								? body.userRequest.utterance.trim() : '';

				if (!userText) {
					kakaoResponse = buildSimpleTextResponse('궁금한 내용을 자연스럽게 입력해 주세요 😊\n예) 갓바위 주차장 알려줘');
					break;
				}

				const faqs = await searchFaqs(regionCode, userText);
				kakaoResponse = buildFaqSearchResponse(userText, faqs);
				break;
			}

			default: {
				console.log('알 수 없는 intentName:', intentName);
				kakaoResponse = buildSimpleTextResponse(
					'요청하신 내용을 이해하기가 조금 어려워요 😅\n메뉴를 다시 선택해 주세요.'
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
 * Render환경용 포트 설정
 * =============================== */
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});



/* ===============================
 * 기본 함수들
 * =============================== */

// Webhook json - 기본형
function buildSimpleTextResponse(text) {
	return {
		version: '2.0',
		template: { outputs: [ { simpleText: { text, }, }, ], },
	};
}

// Utility - Kakao Request 파라미터
function getParam(params, name, defaultValue) {
	const raw = params?.[name];

	if (raw == null) return defaultValue;

	if (typeof raw === 'string') return raw;           	// 'CULTURAL_TEMPLE'
	if (typeof raw === 'object' && 'value' in raw) {	// { value: 'CULTURAL_TEMPLE' }
		return raw.value;                           	
	}

	return defaultValue;
}

// Utility - 네이버지도 URL 변환
function buildNaverMapURL(address) {
	const encoded = encodeURIComponent(address);
	return `https://map.naver.com/v5/search/${encoded}`;
}

// Utility - 줄바꿈처리 함수
const normalizeText = (text) => text.replace(/\\n/g, "\n");



/* ===============================
 * 메인 메뉴
 * =============================== */
 
 // Menu - 메인메뉴
function buildMainMenuResponse(regionCode) {
	// 경산과 영주 구성을 다르게 하려면
	// 동일한 Git을 사용하고 오픈빌더 블록에 일반 파라미터에 "region_code"에 "yeongju"를 입력 후
	// 이 함수 아래에 else if (region_code === "yeongju")로 처리하면 됨
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
										imageUrl: `${defImgURL}kyeongsan_m_1_info.png`,
									},
									buttons: [
										{
											label: '관광지 보러가기',
											action: 'message',
											// message 액션 : 대화창에 사용자 방향에서 지정 메시지를 던지도록 처리
											// 블록에 지정된 사용자 발화로 메시지 던지면 (ex."처음으로")
											// 그럼 해당 블록으로 이동 (ex. "main"블록)
											messageText: getFirstUtterance('TOUR_MAIN'),
										},
									],
								},
								// 2) 투어 프로그램 안내
								{
									title: '투어 프로그램 안내',
									description: '테마별 여행 코스를 편하게 즐겨보세요!',
									thumbnail: {
										imageUrl: `${defImgURL}kyeongsan_m_2_tour.png`,
									},
									buttons: [
										{
											label: '투어 프로그램 보러가기',
											action: 'message',
											messageText: getFirstUtterance('PROGRAMS'),
										},
									],
								},
								// 3) 교통 · 편의 정보
								{
									title: '교통·편의정보',
									description: '주차장·버스·안내소 위치를 쉽게 찾아보세요.',
									thumbnail: {
										imageUrl: `${defImgURL}kyeongsan_m_3_traffic.png`,
									},
									buttons: [
										{
											label: '교통·편의정보 보러가기',
											action: 'message',
											messageText: getFirstUtterance('TRANSPORT'),
										},
									],
								},
								// 4) 자주 묻는 질문
								{
									title: '자주 묻는 질문',
									description: '여행 중 자주 물어보는 정보를 모았어요.',
									thumbnail: {
										imageUrl: `${defImgURL}kyeongsan_m_4_faq.png`,
									},
									buttons: [
										{
											label: '자주 묻는 질문 보러가기',
											action: 'message',
											messageText: getFirstUtterance('QNA_MAIN'),
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
						messageText: getFirstUtterance('MAIN'),
					},
				],
			},
		};
	//}
}



/* ===============================
 * 관광지 목록
 * =============================== */

// Menu - 관광지목록
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
									messageText: getFirstUtterance('TOUR_CULTURE'),
								},
								{
									label: '자연경관/산책명소',
									action: 'message',
									messageText: getFirstUtterance('TOUR_NATURE'),
								},
								{
									label: '축제·체험·볼거리',
									action: 'message',
									messageText: getFirstUtterance('TOUR_FESTIVAL'),
								},
							],
						},
					},
				],
				quickReplies: [
					{
						label: '처음으로',
						action: 'message',
						messageText: getFirstUtterance('MAIN'),
					},
				],
			},
		};
	//}
}

// DB - 카테고리별 관광지 목록
async function getTouristSpots(regionCode, categoryCode) {
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
	
	return result.rows;
}

// Webhook json - 관광지 목록
function buildTouristSpotCarouselResponse(spots) {
	if (!spots || spots.length === 0) {
		return buildSimpleTextResponse('해당 카테고리의 관광지 정보를 찾지 못했어요 😢\n다른 유형을 선택해 주세요.');
	}

	const items = spots.slice(0, 10).map(s => {
		const descLines = [];
		if (s.summary) descLines.push(s.summary);
		if (s.address) descLines.push(`📍 ${s.address}`);
		
		const description = descLines.join('\n');
		const naverMapUrl = buildNaverMapURL(s.address);
		
		const buttons = [];

		if (s.homepage_url) {
			buttons.push({
				label: '웹페이지 보기',
				action: 'webLink',
				webLinkUrl: s.homepage_url,
			});
		}

		buttons.push({
			label: '지도보기',
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
					messageText: getFirstUtterance('MAIN'),
				},
				{
					label: '다른 유형 보기',
					action: 'message',
					messageText: getFirstUtterance('TOUR_MAIN'),
				},        
			],
		},
	};
}



/* ===============================
 * 투어 프로그램
 * =============================== */
 
const TOUR_MAIN_IMAGE_URL = `${defImgURL}program_main.png`;

// DB - 투어 프로그램 목록
async function getTourCourses(regionCode) {
	const text = `
		SELECT id, region_code, course_name, course_type, course_detail, course_image_url, sort_order
		FROM tour_courses
		WHERE region_code = $1
		  AND is_active = TRUE
		ORDER BY sort_order NULLS LAST, course_name;
	`;

	const values = [regionCode];
	const result = await pool.query({ text, values });
	
	return result.rows; 
}

// Webhook json - 투어 프로그램 기본정보 
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

// Webhook json - 투어 프로그램 목록
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
					messageText: getFirstUtterance('MAIN'),
				},
			],
		},
	};
}



/* ===============================
 * 교통 및 편의정보
 * =============================== */
 
// Menu - 교통편의정보
function buildTransportInfoMenuResponse(regionCode) {
	//if (regionCode === 'gyeongsan') {
		return {
			version: '2.0',
			template: {
				outputs: [
					{
						simpleText: {
							text: `이동이 편한 경산 여행!\n어디든 도와드릴게요 🚆🚌\n필요한 정보를 선택해 주세요 👇`,
						},
					},
				],
				quickReplies: [
					{
						label: '처음으로',
						action: 'message',
						messageText: getFirstUtterance('MAIN'),
					},
					{
						label: '주차장',
						action: 'message',
						messageText: getFirstUtterance('TRANS_PARKING'),
					},
					{
						label: '버스',
						action: 'message',
						messageText: getFirstUtterance('TRANS_BUS'),
					},
					{
						label: '관광안내소',
						action: 'message',
						messageText: getFirstUtterance('TRANS_CENTER'),
					},
					{
						label: '이동동선',
						action: 'message',
						messageText: getFirstUtterance('TRANS_ROUTE'),
					},
				],
			},
		};
	//}
}

// Webhook json - 주차장 목록
function buildParkingCarouselResponse(spots) {
	if (!spots || spots.length === 0) {
		return buildSimpleTextResponse('해당 카테고리의 정보를 찾지 못했어요 😢\n다른 유형을 선택해 주세요.');
	}

	const items = spots.slice(0, 10).map(s => {
		const descLines = [];
		if (s.summary) descLines.push(s.summary);
		if (s.address) descLines.push(`📍 ${s.address}`);
		
		const description = descLines.join('\n');
		const naverMapUrl = buildNaverMapURL(s.address);
		
		const buttons = [];

		if (s.homepageUrl) {
			buttons.push({
				label: '웹페이지 보기',
				action: 'webLink',
				webLinkUrl: s.homepage_url,
			});
		}

		buttons.push({
			label: '지도보기',
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
					messageText: getFirstUtterance('MAIN'),
				},
				{
					label: '다른 유형 보기',
					action: 'message',
					messageText: getFirstUtterance('TRANSPORT'),
				},        
			],
		},
	};
}

// Menu - 버스노선
function buildBusRouteMenuResponse(regionCode) {
	//if (regionCode === 'gyeongsan') {
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
						messageText: getFirstUtterance('MAIN'),
					},
					{
						label: '간선',
						action: 'message',
						messageText: getFirstUtterance('TRANS_BUS_EDGE'),
					},
					{
						label: '순환선',
						action: 'message',
						messageText: getFirstUtterance('TRANS_BUS_LOOP'),
					},
					{
						label: '지선',
						action: 'message',
						messageText: getFirstUtterance('TRANS_BUS_BRANCH'),
					},
				],
			},
		};
	//}
}

// DB - 타입별 버스노선 목록
async function getBusRouteNumbersByType(regionCode, routeType) {
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
	
	return result.rows.map(r => r.route_number);
}

// Webhook json - 타입별 버스노선 바로연결 버튼 목록
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
						text: `🚌 ${typeLabel} 노선을 선택해 주세요.\n👉 번호를 누르시면 상세 정보를 안내해 드릴게요.😊`,
					},
				},
			],
			quickReplies: [
				{
					label: '처음으로',
					action: 'message',
					messageText: getFirstUtterance('MAIN'),
				},
				...quickReplies,
			],
		},
	};
}

// DB - 버스번호 기준 버스상세정보
async function getBusRouteDetail(regionCode, routeNumber) {
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
	
	return result.rows[0] || null;
}

// Webhook json - 버스번호 기준 버스상세정보
function buildBusRouteDetailResponse(route) {
	if (!route) {
		return buildSimpleTextResponse('해당 버스 노선 정보를 찾지 못했어요 😢\n번호를 다시 한 번 확인해 주세요.');
	}

	const typeLabel = getBusRouteTypeLabel(route.route_type);
	
	const descLines = [];
	descLines.push(`🚍노선번호: ${route.route_number} (${typeLabel})`);
	descLines.push(`🚩출발지: ${route.origin_name}`);
	descLines.push(`🎯도착지: ${route.destination_name}`);

	if (route.interval_info) descLines.push(`🔁배차간격: ${route.interval_info}`);
	if (route.first_bus_time || route.last_bus_time) {
		descLines.push(`🕒첫차/막차: ${route.first_bus_time || '-'} ~ ${route.last_bus_time || '-'}`);
	}

	const description = normalizeText(descLines.join('\n'));
	
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
						buttons,
					},
				},
			],
			quickReplies: [
				{
					label: '처음으로',
					action: 'message',
					messageText: getFirstUtterance('MAIN'),
				},
				{
					label: '간선버스',
					action: 'message',
					messageText: getFirstUtterance('TRANS_BUS_EDGE'),
				},
				{
					label: '순환버스',
					action: 'message',
					messageText: getFirstUtterance('TRANS_BUS_LOOP'),
				},
				{
					label: '지선버스',
					action: 'message',
					messageText: getFirstUtterance('TRANS_BUS_BRANCH'),
				},
			],
		},
	};
}

// Menu - 이동동선
function buildTravelRouteMenuResponse(regionCode) {
	//if (regionCode === 'gyeongsan') {
		const text = '🧭 경산 여행 어디부터 갈지 고민되시나요?\n아래 이동 동선 유형 중 하나를 선택해 보세요!\n'
					+ '원하는 스타일에 맞춰 추천 루트를 안내해 드릴게요 😊\n\n'
					+ '📌 테마형 이동 동선\n🚉 출발지 기준 이동\n🗺 반나절·1일 코스형';
		
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
						messageText: getFirstUtterance('MAIN'),
					},
					{
						label: '테마형',
						action: 'message',
						messageText: getFirstUtterance('TRANS_ROUTE_THEME'),
					},
					{
						label: '출발지기준',
						action: 'message',
						messageText: getFirstUtterance('TRANS_ROUTE_HUB'),
					},
					{
						label: '코스형',
						action: 'message',
						messageText: getFirstUtterance('TRANS_ROUTE_COURSE'),
					},
				],
			},
		};
	//}
}

// DB - 이동동선
async function getTravelRoutes(regionCode, routeType = null) {
	console.log('▶ getTravelRoutes()', regionCode, routeType);

	let text = `
		SELECT id, region_code, route_type,	title, description, items,
			   total_time, transport_type, map_url, sort_order
			FROM travel_routes
			WHERE region_code = $1
			  AND is_active = TRUE
	`;
	
	const values = [regionCode];

	if (routeType) {
		text += ` AND route_type = $2`;
		values.push(routeType);
	}
	text += ` ORDER BY sort_order NULLS LAST, id;`;

	const result = await pool.query({ text, values });
	console.log('travel_routes rowCount =', result.rowCount);

	return result.rows;
}

// Webhook json - 이동동선
function buildTravelRouteListResponse(routes, routeType) {
	const typeLabel = getTravelRouteTypeLabel(routeType);

	if (!routes || routes.length === 0) {
		return buildSimpleTextResponse(`${typeLabel} 정보를 찾지 못했어요 😢\n다른 유형을 선택해 주세요.`);
	}

	const items = routes.slice(0, 10).map((r) => {
		const lines = [];

		if (r.description)	lines.push(r.description);
	
		if (Array.isArray(r.items) && r.items.length > 0) {
			const routeStr = r.items.join(' → ');
			lines.push(`🗺 경로: ${routeStr}`);
		}

		if (r.total_time) 		lines.push(`🕒 소요시간: ${r.total_time}`);
		if (r.transport_type) 	lines.push(`🚍 이동수단: ${r.transport_type}`);
		const description = lines.join('\n');

		const buttons = [];

		if (r.map_url) {
			buttons.push({
				label: '지도보기',
				action: 'webLink',
				webLinkUrl: r.map_url,
			});
		}

		return {
			title: r.title,
			description,
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
					messageText: getFirstUtterance('MAIN'),
				},
				{
					label: '테마형',
					action: 'message',
					messageText: getFirstUtterance('TRANS_ROUTE_THEME'),
				},
				{
					label: '출발지기준',
					action: 'message',
					messageText: getFirstUtterance('TRANS_ROUTE_HUB'),
				},
				{
					label: '코스형',
					action: 'message',
					messageText: getFirstUtterance('TRANS_ROUTE_COURSE'),
				},
			],
		},
	};
}



/* ===============================
 * 자주 묻는 질문
 * =============================== */

// DB - FAQ 카테고리 목록
async function getFaqCategories(regionCode) {
	const text = `
		SELECT region_code, category_code, title, sort_order
			FROM faq_categories
			WHERE region_code = $1
			  AND is_active = TRUE
			ORDER BY sort_order ASC, id ASC
	`;

	const values = [regionCode];
	const result = await pool.query({ text, values });

	return result.rows;
}

// DB - 카테고리별 FAQ 목록
async function getFaqsByCategory(regionCode, categoryCode) {
	const text = `
		SELECT id, category_code, question, answer, sort_order
			FROM faqs
			WHERE region_code = $1
			  AND category_code = $2
			  AND is_active = TRUE
			ORDER BY sort_order ASC, id ASC
	`;

	const values = [regionCode, categoryCode];
	const result = await pool.query({ text, values });

	return result.rows;
}

// String - F&A 카테고리와 블록 매핑
function getFaqCategoryMessageText(categoryCode) {
	const info = BlockList.find(b => b.category === categoryCode) || null;
	
	if (!info || !info.blockName) {
		console.warn('Fallback used for', categoryCode);
		return '';
	}
  
	return getFirstUtterance(info.menu);
}

// Webhook json - FAQ 카테고리 리스트
function buildFaqCategoryListResponse(categories) {
	if (!categories || categories.length === 0) {
		return buildSimpleTextResponse('등록된 자주 묻는 질문 카테고리가 아직 없어요 😢');
	}

	const items = categories.map((c) => {
		const label = getFaqCategoryLabel(c.category_code);

		return {
			title: label,
			description: `해당 유형의 자주 묻는 질문을 확인할 수 있어요.`,
			buttons: [
				{
					label: `${label} 보기`,
					action: 'message',
					messageText: getFaqCategoryMessageText(c.category_code),
				},
			],
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
					messageText: getFirstUtterance('MAIN'),
				},
			],
		},
	};
}

// Webhook json - FAQ 답변 목록
function buildFaqListResponse(categoryCode, faqs) {
	const label = getFaqCategoryLabel(categoryCode);

	if (!faqs || faqs.length === 0) {
		return buildSimpleTextResponse(`${label}에 대한 자주 묻는 질문이 아직 준비되지 않았어요 😢`);
	}

	let texts = [];
	
	const items = faqs.slice(0, 10).map((f) => {
		if(f.question) {
			const descLines = [];
			
			const question = 'Q.' + (f.question || '질문');
			const answer = 
				'A.' + 
				(f.answer && f.answer.trim().length > 0 ? f.answer : '답변 준비 중입니다. 조금만 기다려 주세요.');
			
			descLines.push(question);
			descLines.push(answer);
			descLines.push('\n');
			
			const description = descLines.join('\n');
			
			texts.push(description);
		}
	});
	
	const text = texts.join('\n');

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
					messageText: getFirstUtterance('MAIN'),
				},
				{
					label: '다른 유형의 질문',
					action: 'message',
					messageText: getFirstUtterance('QNA_MAIN'),
				},
			],
		},
	};
}

// DB - 키워드별 FAQ 목록
async function searchFaqs(regionCode, keyword, limit = 5) {
	const text = `
		SELECT f.id, f.category_code, f.question, f.answer, f.sort_order, c.title AS category_title
			FROM faqs f
				JOIN faq_categories c
				  ON f.category_code = c.category_code
			WHERE c.region_code = $1
			  AND f.is_active = TRUE
			  AND c.is_active = TRUE
			  AND (
					f.question ILIKE '%' || $2 || '%'
					OR f.answer ILIKE '%' || $2 || '%'
				  )
			ORDER BY f.sort_order ASC, f.id ASC
			LIMIT $3;
	`;

	const values = [regionCode, keyword, limit];
	const result = await pool.query({ text, values });
	
	return result.rows;
}

// Webhook json - 키워드별 FAQ 답변 목록
function buildFaqSearchResponse(keyword, faqs) {
	if (!faqs || faqs.length === 0) {
		return {
			version: '2.0',
			template: {
				outputs: [
					{
						simpleText: {
							text:
								`검색어 "${keyword}" 에 해당하는 자주 묻는 질문을 찾지 못했어요 😢\n` +
								`표현을 조금 바꾸어 다시 질문해 보시거나,\n` +
								`"자주 묻는 질문" 버튼을 눌러 카테고리별로 확인해 주세요.`,
						},
					},
				],
				quickReplies: [
					{
						label: '처음으로',
						action: 'message',
						messageText: getFirstUtterance('MAIN'),
					},
					{
						label: '자주 묻는 질문',
						action: 'message',
						messageText: getFirstUtterance('QNA_MAIN'),
					},
				],
			},
		};
	}

	const items = faqs.map((f) => {
		const question = f.question || '질문';
		const answer = f.answer && f.answer.trim().length > 0
			? f.answer : '답변 준비 중입니다. 조금만 기다려 주세요.';

		const categoryTitle = f.category_title || f.category_code || '';

		const descLines = [];
		if (categoryTitle) descLines.push(`📂 카테고리: ${categoryTitle}`);
		descLines.push('');
		descLines.push(answer);

		return {
			title: question,
			description: descLines.join('\n'),
			thumbnail: {
				mageUrl: `${defImgURL}kyeongsan_m_4_faq.png`,
			},
			buttons: [
				{
					label: '처음으로',
					action: 'message',
					messageText: getFirstUtterance('MAIN'),
				},
				{
					label: '다른 질문 하기',
					action: 'message',
					messageText: getFirstUtterance('QNA_SEARCH'),
				},
			],
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
					messageText: getFirstUtterance('MAIN'),
				},
				{
					label: '자주 묻는 질문',
					action: 'message',
					messageText: getFirstUtterance('QNA_MAIN'),
				},
			],
		},
	};
}