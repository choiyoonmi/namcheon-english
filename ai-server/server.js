require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(express.json({ limit: '50mb' }));
app.use(cors());

const SYSTEM_PROMPT = `너는 한국 중·고등학교 영어 내신 시험 전문 출제 AI다.
너는 실제 학교 시험지와 동일한 수준의 난이도와 형식을 갖춘 문제를 반드시 출제해야 한다.

[출제의 핵심 원칙 - 반드시 준수]
1. 난이도는 절대 쉬워서는 안됨. 학교 시험지 수준 유지 필수
2. 선택지는 모두 3~5줄 이상의 길이 유지 (한 줄 선택지 금지)
3. 교과서 원문을 정확하게 활용 (과도한 요약/압축 금지)
4. 지문은 반드시 완전한 문단 포함 (문장 자르기 금지)
5. 오답의 70%는 지문의 단어/표현을 활용해 교묘하게 함정 설정
6. 패시지마다 2~3문항 연결 (단독 문항 최소화)

[난이도별 출제 규칙]
'쉬움': 2점 14문항 (직접인용, 선택지 명확) + 3점 8문항 + 서논술 2문항
'보통': 2점 4문항 + 3점 12문항 (심화해석) + 4점 6문항 (고난이) + 서논술 2문항
'어려움': 2점 0문항 + 3점 8문항 (고난이해석) + 4점 10문항 (초고난이) + 서논술 6문항 (조건 복잡)

[필수 출제 유형 - 정확한 개수 준수]
- 독해/내용일치 또는 불일치: 2~3문항 (교묘한 오답)
- 독해/주제·제목·주요내용: 1~2문항 (5개 모두 그럴듯)
- 독해/추론·빈칸: 2문항 (문맥 유추 필수)
- 어법/복합밑줄(ⓐ~ⓔ): 1문항 필수 (5개 모두 정교)
- 어법/단문 선택형: 2~3문항 (시제, 태, 수일치, 전치사)
- 어휘/영영풀이: 1~2문항 (설명 3~4줄, 난해한 단어)
- 어휘/뜻연결: 1문항
- 대화/순서배열: 1~2문항 (흐름 자연스러움)
- 대화/빈칸완성: 1문항 (5개 선택지 길이 유사)
- 서·논술형: 5~6문항 (조건 3개 이상)

[선택지 작성의 기술]
- 각 선택지 최소 3줄 이상 (절대 한 줄 금지)
- 정답과 오답의 길이 차이 최소화
- 오답은 지문의 표현을 가져와 의미를 교묘하게 변형
- 특히 내용일치 문제의 오답은 "반대 의미", "부분적 일치", "추론이 필요한 경우" 등으로 구성

[지문/패시지 구성 규칙]
- 지문은 완전한 문단 단위 (절대 문장을 자르거나 일부만 사용 금지)
- 지문 길이: 150~300단어 (100단어 이하 금지)
- 대화문 포함 시 4개 이상의 주고받기
- 문법/어휘 요소를 자연스럽게 포함

[JSON 응답 형식 - 필수]
마크다운 코드블록 절대 금지. 순수 JSON만 응답.

응답 예시:
{
  "analysis": {
    "passages": ["지문 제목"],
    "grammar_points": ["to부정사"],
    "idioms": ["표현 목록"],
    "has_dialogue": true
  },
  "questions": [
    {
      "id": 1,
      "type": "독해·내용일치",
      "passage_title": "지문 제목",
      "passage": "전체 지문",
      "question": "질문",
      "choices": ["①...", "②...", "③...", "④...", "⑤..."],
      "answer": 2,
      "points": 3,
      "explanation": "해설"
    }
  ]
}`;

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
    '쉬움': '2점 14문항 + 3점 8문항 + 서논술형 2문항 = 100점',
    '보통': '2점 4문항 + 3점 12문항 + 4점 6문항 + 서논술형 2문항 = 100점',
    '어려움': '3점 8문항 + 4점 10문항 + 서논술형 6문항 = 100점'
  };

  return `[출제 요청]
${grade}학년 영어 ${totalQ}문항 / 난이도: ${difficulty} / ${round}회차

[배점 구성]
${diffMap[difficulty]}

[지문 규칙]
- 원문을 완전하게 포함 (절대 자르지 말 것)
- 길이: 150~300단어 (100단어 이하 금지)
- 지문당 최소 2~3문항

[선택지 규칙]
- 모든 선택지 최소 3줄 이상
- 오답은 지문 표현을 활용해 의미 변형
- 정답과 유사한 길이로 통일

[필수 유형 엄격 준수]
- 독해/내용일치: 2~3문항 (교묘한 오답)
- 독해/주제: 1~2문항 (5개 모두 그럴듯)
- 독해/추론: 2문항
- 어법/복합밑줄: 1문항 (5개 정교함)
- 어법/단문: 2~3문항
- 어휘/영영풀이: 1~2문항
- 어휘/뜻연결: 1문항
- 대화/순서배열: 1~2문항
- 대화/빈칸: 1문항
- 서논술: 5~6문항

[회차별 변형 요청 - ${round}회차]
이미 출제된 관용표현 (피할 것): ${usedIdioms.length > 0 ? usedIdioms.join(', ') : '없음'}
이미 출제된 유형들 (다양하게): ${usedTypes.length > 0 ? usedTypes.join(', ') : '없음'}

[교과서 텍스트]
${pdfText.substring(0, 6000)}

[응답 형식]
JSON만 응답. 마크다운 블록 금지.`;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'namcheon-ai-server' });
});

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

    let parsedResponse;
    try {
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

      if (parsed.analysis?.idioms) {
        usedIdioms.push(...parsed.analysis.idioms);
      }
      if (parsed.questions) {
        parsed.questions.forEach(q => usedTypes.push(q.type));
      }

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

// Analyze exam PDF and generate essay questions
app.post('/api/analyze-exam', async (req, res) => {
  try {
    const { pdfText, grade = '2', round = '1', difficulty = '보통' } = req.body;

    if (!pdfText) {
      return res.status(400).json({ error: 'PDF text is required' });
    }

    const analyzePrompt = `다음 기출문제를 분석하고, 회차별로 필수 유형에 맞춰 서술형 5문항을 생성하세요.

[기출문제 텍스트]
${pdfText.substring(0, 5000)}

[생성 요구사항]
학년: ${grade}학년
회차: ${round}회차
난이도: ${difficulty}

[필수 서술형 유형 (5문항)]
1. 관용표현 또는 핵심 표현 영작 (3점) - 1문항
2. 조건영작 (조건 3개 이상) (4점) - 1문항
3. to부정사/수량표현 활용 (3점) - 1문항
4. 복합조건 영작 (4점) - 2문항

[출력 형식]
다음 Python 리스트 형태로만 응답. 마크다운 블록 금지.
[
  {
    "id": 번호,
    "round": ${round},
    "type": "essay",
    "question": "문제 내용",
    "answer": "표준 정답",
    "points": 점수,
    "explanation": "해설",
    "conditions": ["조건1", "조건2"],
    "topic": "유형"
  }
]

지금 시작하세요:`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      system: '너는 한국 중학교 영어 시험 출제 전문가다. 기출문제를 분석해서 필수 유형의 서술형 문제를 생성한다.',
      messages: [{ role: 'user', content: analyzePrompt }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    let cleanText = responseText.trim();
    if (cleanText.startsWith('```python')) {
      cleanText = cleanText.replace(/^```python\n?/, '').replace(/\n?```$/, '');
    } else if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }

    const parsedResult = JSON.parse(cleanText);

    res.json({
      success: true,
      grade: grade,
      round: round,
      difficulty: difficulty,
      questions: parsedResult,
      code: `GRADE${grade}_QUESTIONS = [\n    # ===== ROUND ${round} (서술형) =====\n    ${JSON.stringify(parsedResult, null, 4)}\n]`
    });
  } catch (error) {
    console.error('Analyze Error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
