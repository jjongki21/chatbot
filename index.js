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

app.get('/', (req, res) => {
  res.send('Kakao Chatbot is running.');
});

app.post('/kakao/webhook', async (req, res) => {
  try {
    const body = req.body;
    const intentName = body.intent?.name || '';
    const params = body.action?.params || {};

    // 디버그 로그
    console.log('intentName:', intentName);
    console.log('raw params:', JSON.stringify(params, null, 2));

    // 🔑 여기서부터는 getParam 사용
    const regionCode = getParam(params, 'region_code', 'gyeongsan');

    let kakaoResponse;

    switch (intentName) {
      case '관광지_카테고리_목록': {
        const categoryCode = getParam(params, 'category_code', 'CULTURAL_TEMPLE');
        console.log('[관광지_카테고리_목록] region:', regionCode, 'category:', categoryCode);

        const spots = await getTouristSpots(regionCode, categoryCode);
        console.log('spots.length =', spots.length);

        kakaoResponse = buildTouristSpotListResponse(spots, categoryCode);
        break;
      }

      case '시티투어_프로그램_목록': {
        const programTypeCode = getParam(params, 'program_type_code', 'CITY_TOUR');
        console.log('[시티투어_프로그램_목록] region:', regionCode, 'type:', programTypeCode);

        const programs = await getTourPrograms(regionCode, programTypeCode);
        console.log('programs.length =', programs.length);

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


// Kakao params에서 안전하게 값 꺼내기
function getParam(params, name, defaultValue) {
  const raw = params?.[name];

  if (raw == null) return defaultValue;

  if (typeof raw === 'string') return raw;           // "CULTURAL_TEMPLE"
  if (typeof raw === 'object' && 'value' in raw) {
    return raw.value;                                // { value: "CULTURAL_TEMPLE" }
  }

  return defaultValue;
}

/* ===============================
 * Database Select 처리
 * =============================== */

// 관광지 목록 조회
async function getTouristSpots(regionCode, categoryCode) {
  const query = `
    SELECT id, name_ko, summary, main_image_url, address
    FROM tourist_spots
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

// 시티투어/상설투어 프로그램 목록 조회
async function getTourPrograms(regionCode, programTypeCode) {
  const query = `
    SELECT id, name_ko, summary, main_image_url, duration, schedule_info
    FROM tour_programs
    WHERE region_code = $1
      AND program_type_code = $2
      AND is_active = TRUE
    ORDER BY sort_order NULLS LAST, name_ko
    LIMIT 5;
  `;
  const values = [regionCode, programTypeCode];

  const result = await pool.query(query, values);
  return result.rows;
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

/* ===============================
 * 카카오 스킬 응답 빌더들
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

// 관광지 목록 응답 (simpleText + quickReplies 예시)
function buildTouristSpotListResponse(spots, categoryCode) {
  if (!spots || spots.length === 0) {
    return buildSimpleTextResponse(
      '해당 카테고리의 관광지 정보를 찾지 못했어요 😢\n' +
      '다른 카테고리를 선택해 주세요.'
    );
  }

  let text = '📍 경산 관광지 안내\n\n';
  spots.forEach((s, idx) => {
    text += `${idx + 1}. ${s.name_ko}\n`;
    if (s.summary) text += `   - ${s.summary}\n`;
    if (s.address) text += `   📌 ${s.address}\n`;
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
          label: '문화유적/사찰',
          action: 'message',
          messageText: '문화유적/사찰 알려줘',
        },
        {
          label: '자연경관/산책명소',
          action: 'message',
          messageText: '자연경관/산책명소 알려줘',
        },
        {
          label: '축제/체험/볼거리',
          action: 'message',
          messageText: '축제/체험/볼거리 알려줘',
        },
        {
          label: '메인 메뉴',
          action: 'message',
          messageText: '메인 메뉴',
        },
      ],
    },
  };
}

// 시티투어/프로그램 목록 응답
function buildTourProgramListResponse(programs, programTypeCode) {
  if (!programs || programs.length === 0) {
    return buildSimpleTextResponse(
      '해당 종류의 투어 프로그램 정보를 찾지 못했어요 😢\n' +
      '다른 투어를 선택해 주세요.'
    );
  }

  let text = '🚌 시티투어/상설투어 프로그램\n\n';
  programs.forEach((p, idx) => {
    text += `${idx + 1}. ${p.name_ko}\n`;
    if (p.summary) text += `   - ${p.summary}\n`;
    if (p.duration) text += `   🕒 ${p.duration}\n`;
    if (p.schedule_info) text += `   📅 ${p.schedule_info}\n`;
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
          label: '시티투어',
          action: 'message',
          messageText: '시티투어 알려줘',
        },
        {
          label: '현명품투어',
          action: 'message',
          messageText: '현명품투어 알려줘',
        },
        {
          label: '소원성취투어',
          action: 'message',
          messageText: '소원성취투어 알려줘',
        },
        {
          label: '선비문화투어',
          action: 'message',
          messageText: '선비문화투어 알려줘',
        },
        {
          label: '메인 메뉴',
          action: 'message',
          messageText: '메인 메뉴',
        },
      ],
    },
  };
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
        {
          label: '메인 메뉴',
          action: 'message',
          messageText: '메인 메뉴',
        },
      ],
    },
  };
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

// Render 환경용 포트 설정
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
