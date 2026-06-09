require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json({ limit: '50mb' }));
app.use(cors());

const SYSTEM_PROMPT = `
너는 한국 중·고등학교 영어 내신 시험 전문 출제 AI다.
선생님이 시험 범위 텍스트를 전달하면 아래 규칙대로 출제한다.

[자동 분석]
PDF에서 추출한 텍스트를 받으면:
1. 지문 목록·핵심소재·등장인물 파악
2. 문법 포인트 전체 추출 (to부정사·동명사·관계대명사·조동사 등)
3. 관용표현·숙어 목록화
4. 대화문 유무 및 빈칸 가능 위치 파악
5. 학년·난이도 자동 추정

[출제 원칙]
- 교과서 원문 그대로 사용 (요약·압축 금지)
- 동일 지문 동일 유형 중복 금지
- 매력적인 오답 포함 (지문 내 단어 활용)
- 서·논술형 조건 2개 이상 부과
- 관용표현 있으면 서·논술형에 반드시 포함
- 대화문 있으면 순서배열 또는 빈칸완성 반드시 포함

[필수 유형 체크리스트]
□ 독해·내용일치/불일치: 2문항
□ 독해·주제/제목: 2문항
□ 독해·추론/빈칸: 2문항
□ 어법·복합밑줄 오류찾기(ⓐ~ⓔ): 1문항 필수
□ 어법·단문 선택형: 2문항
□ 어휘·영영풀이: 2문항
□ 어휘·뜻연결: 1문항
□ 대화·순서배열: 1문항 (대화문 있을 경우 필수)
□ 대화·빈칸완성: 1문항 (대화문 있을 경우 필수)
□ 서·논술형: 5문항
  - 관용표현 영작: 1문항
  - 조건영작(조건3개): 1문항
  - to부정사/수량표현: 1문항
  - 복합조건: 2문항

[문제 구성 예시]
{
  "id": 1,
  "type": "독해·내용일치",
  "passage_title": "지문 제목",
  "question": "다음 글의 내용과 일치하는 것은?",
  "choices": ["①...", "②...", "③...", "④...", "⑤..."],
  "answer": 3,
  "points": 3,
  "difficulty": "보통",
  "explanation": "해설"
}

[정답 형식]
항상 JSON으로만 응답하며, 절대 마크다운 블럭(\\`\\`\\`)을 사용하지 말 것.
JSON 시작 { 부터 끝 } 까지만 응답.
`;

function buildUserPrompt(pdfText, options) {
  const {
    totalQ = 24,
    difficulty = '보통',
    round = 1,
    usedIdioms = [],
    usedTypes = [],
    grade = '2'
  } = options;

  const diffMap = {
    '쉬움': '2점 14문항 + 3점 8문항 + 서논술형 2문항',
    '보통': '2점 6문항 + 3점 12문항 + 4점 4문항 + 서논술형 2문항',
    '어려움': '3점 10문항 + 4점 8문항 + 서논술형 6문항'
  };

  return `
[요청]
${grade}학년 영어 시험 범위 텍스트에서 ${totalQ}문항을 출제하세요.

[배점 구성]
${diffMap[difficulty]}

[필수 유형 (중복 제외)]
- 독해/내용일치·불일치: 2~3문항
- 독해/주제·제목: 1문항
- 독해/추론·빈칸: 2문항
- 어법/복합밑줄(ⓐ~ⓔ): 1문항
- 어법/단문: 2문항
- 어휘/영영풀이: 1문항
- 대화/순서배열: 1문항 (대화문 있을 때)
- 대화/빈칸: 1문항 (대화문 있을 때)
- 서논술형: 2~6문항

[회차별 제약 — ${round}회차]
이미 사용한 관용표현: ${usedIdioms.length > 0 ? usedIdioms.join(', ') : '없음'}
이미 출제한 유형: ${usedTypes.length > 0 ? usedTypes.join(', ') : '없음'}
→ 위와 겹치지 않도록 다양한 포인트에서 출제

[교과서 텍스트]
${pdfText.substring(0, 5000)}

[응답 형식]
JSON으로만 응답. 마크다운 블럭 금지.
{
  "analysis": {
    "passages": ["지문1 제목", ...],
    "grammar_points": ["to부정사", ...],
    "idioms": ["~ing", ...],
    "has_dialogue": true/false,
    "difficulty_detected": "중상"
  },
  "questions": [
    {
      "id": 1,
      "type": "독해·내용일치",
      "passage_title": "...",
      "question": "다음 글의 내용과 일치하는 것은?",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "answer": 3,
      "points": 3,
      "explanation": "..."
    },
    ...
  ]
}
`;
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'namcheon-ai-server' });
});

// Main API: Generate questions from PDF text
app.post('/api/generate', async (req, res) => {
  try {
    const { pdfText, options = {} } = req.body;

    if (!pdfText || pdfText.trim().length === 0) {
      return res.status(400).json({ error: 'PDF text is required' });
    }

    const userPrompt = buildUserPrompt(pdfText, options);

    console.log(`[AI Generate] Grade: ${options.grade || '2'}, Round: ${options.round || 1}, Difficulty: ${options.difficulty || '보통'}`);

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON response
    let parsedResponse;
    try {
      // Remove markdown code blocks if present
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      parsedResponse = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError.message);
      console.error('Response text:', responseText.substring(0, 200));
      return res.status(500).json({
        error: 'Failed to parse AI response',
        details: parseError.message,
        rawResponse: responseText.substring(0, 500)
      });
    }

    res.json(parsedResponse);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate questions',
      type: error.constructor.name
    });
  }
});

// Batch generate: Multiple rounds
app.post('/api/generate-batch', async (req, res) => {
  try {
    const { pdfText, rounds = 1, difficulty = '보통', grade = '2' } = req.body;

    if (!pdfText) {
      return res.status(400).json({ error: 'PDF text is required' });
    }

    const results = [];
    const usedIdioms = [];
    const usedTypes = [];

    for (let round = 1; round <= rounds; round++) {
      console.log(`[Batch Generate] Round ${round}/${rounds}`);

      const userPrompt = buildUserPrompt(pdfText, {
        totalQ: 24,
        difficulty,
        round,
        usedIdioms,
        usedTypes,
        grade
      });

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      let cleanText = responseText.trim();
      if (cleanText.startsWith('```json')) {
        cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(cleanText);
      results.push(parsed);

      // Accumulate used items for next round
      if (parsed.analysis?.idioms) {
        usedIdioms.push(...parsed.analysis.idioms);
      }
      if (parsed.questions) {
        parsed.questions.forEach(q => usedTypes.push(q.type));
      }

      // Rate limit between API calls
      if (round < rounds) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    res.json({
      success: true,
      rounds: results.length,
      data: results
    });
  } catch (error) {
    console.error('Batch API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate API Key
app.get('/api/check-auth', (req, res) => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  res.json({
    authenticated: hasKey,
    model: 'claude-opus-4-8'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 AI Server running on port ${PORT}`);
  console.log(`Health check: GET http://localhost:${PORT}/health`);
  console.log(`Generate endpoint: POST http://localhost:${PORT}/api/generate`);
});
