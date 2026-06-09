let currentGrade = "2";
let currentRound = 1;
let answersVisible = false;
let questionsData = [];

// 페이지 로드 시 AI 섹션 표시
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("aiSection").style.display = "block";
});

// Button selection
document.querySelectorAll(".grade-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".grade-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentGrade = btn.dataset.grade;
  });
});

document.querySelectorAll(".round-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".round-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRound = parseInt(btn.dataset.round);
  });
});

async function loadQuestions() {
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("questionsWrap").innerHTML = "";
  document.getElementById("answerSheet").style.display = "none";
  document.getElementById("toggleAnswerBtn").style.display = "none";
  document.getElementById("loading").style.display = "block";
  answersVisible = false;

  try {
    const res = await fetch(`/api/questions/${currentGrade}/${currentRound}`);
    if (!res.ok) throw new Error("Failed to load");
    questionsData = await res.json();
    renderQuestions(questionsData);

    const examHeader = document.getElementById("examHeader");
    examHeader.style.display = "block";
    document.getElementById("examTitle").textContent =
      `2026학년도 1학기 중간고사 ${currentGrade}학년 영어과 예상문제`;
    document.getElementById("examSubtitle").textContent =
      `제${currentRound}회차`;

    document.getElementById("toggleAnswerBtn").style.display = "inline-flex";
    updateAnswerBtn();
  } catch (e) {
    document.getElementById("questionsWrap").innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><p>문제를 불러오지 못했습니다.<br>잠시 후 다시 시도해 주세요.</p></div>`;
  } finally {
    document.getElementById("loading").style.display = "none";
  }
}

function renderQuestions(questions) {
  const wrap = document.getElementById("questionsWrap");
  wrap.innerHTML = "";

  questions.forEach((q, idx) => {
    const card = document.createElement("div");
    card.className = "question-card";
    card.dataset.id = q.id;

    let passageHtml = "";
    if (q.passage) {
      passageHtml = `<div class="q-passage">${escHtml(q.passage)}</div>`;
    }

    let optionsHtml = "";
    if (q.type === "mc" && q.options) {
      const nums = ["①", "②", "③", "④", "⑤"];
      optionsHtml = `<ul class="q-options">` +
        q.options.map((opt, i) =>
          `<li data-idx="${i+1}" data-correct="${i+1 === q.answer}">
            <span class="option-num">${nums[i]}</span>
            <span>${escHtml(opt)}</span>
          </li>`
        ).join("") +
        `</ul>`;
    }

    const expHtml = q.explanation
      ? `<div class="q-explanation" id="exp-${q.id}">
           <strong>해설:</strong> ${escHtml(q.explanation)}
         </div>`
      : "";

    card.innerHTML = `
      <div class="q-header">
        <div class="q-num">${idx + 1}</div>
        <div class="q-text">${escHtml(q.question)}</div>
        <div class="q-points">[${q.points}점]</div>
      </div>
      ${passageHtml}
      ${optionsHtml}
      ${expHtml}
    `;
    wrap.appendChild(card);
  });
}

function toggleAnswers() {
  answersVisible = !answersVisible;

  document.querySelectorAll(".q-options li").forEach(li => {
    if (li.dataset.correct === "true") {
      li.classList.toggle("correct-answer", answersVisible);
    }
  });

  document.querySelectorAll(".q-explanation").forEach(el => {
    el.classList.toggle("show", answersVisible);
  });

  // Answer sheet
  if (answersVisible) {
    renderAnswerSheet();
    document.getElementById("answerSheet").style.display = "block";
  } else {
    document.getElementById("answerSheet").style.display = "none";
  }

  updateAnswerBtn();
}

function renderAnswerSheet() {
  const grid = document.getElementById("answerGrid");
  const nums = ["①", "②", "③", "④", "⑤"];
  grid.innerHTML = questionsData.map((q, idx) => {
    const ans = q.type === "mc" ? nums[q.answer - 1] : "서술형";
    return `<div class="answer-item">
      <div class="a-num">${idx + 1}번</div>
      <div class="a-val">${ans}</div>
    </div>`;
  }).join("");
}

function updateAnswerBtn() {
  const btn = document.getElementById("toggleAnswerBtn");
  if (answersVisible) {
    btn.textContent = "정답 숨기기";
    btn.classList.add("showing");
  } else {
    btn.textContent = "정답 보기";
    btn.classList.remove("showing");
  }
}

function escHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

// ===== AI 문제 생성 =====

async function generateQuestions() {
  const pdfText = document.getElementById("pdfText").value.trim();
  const grade = document.getElementById("aiGrade").value;
  const difficulty = document.getElementById("aiDifficulty").value;
  const rounds = parseInt(document.getElementById("aiRounds").value);

  if (!pdfText) {
    showAiError("교과서 텍스트를 입력해주세요.");
    return;
  }

  showAiLoading();

  try {
    const response = await fetch("/api/ai/generate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfText: pdfText,
        grade: grade,
        rounds: rounds,
        difficulty: difficulty
      })
    });

    if (!response.ok) {
      const error = await response.json();
      showAiError(error.error || "문제 생성에 실패했습니다.");
      return;
    }

    const result = await response.json();
    renderAiQuestions(result.data, grade, rounds, difficulty);
    showAiResult();
  } catch (e) {
    showAiError("요청 중 오류가 발생했습니다: " + e.message);
  }
}

function renderAiQuestions(data, grade, rounds, difficulty) {
  const wrap = document.getElementById("questionsWrap");
  wrap.innerHTML = "";

  let questionNum = 1;

  data.forEach((roundData, roundIdx) => {
    if (!roundData.questions) return;

    const roundTitle = document.createElement("div");
    roundTitle.className = "round-title";
    roundTitle.innerHTML = `<h2>제${roundIdx + 1}회차</h2>`;
    wrap.appendChild(roundTitle);

    roundData.questions.forEach((q) => {
      const card = document.createElement("div");
      card.className = "question-card";

      let passageHtml = "";
      if (q.passage) {
        passageHtml = `<div class="q-passage">${escHtml(q.passage)}</div>`;
      }

      let optionsHtml = "";
      if (q.choices) {
        optionsHtml = `<ul class="q-options">` +
          q.choices.map((opt, i) =>
            `<li data-idx="${i+1}" data-correct="${i+1 === q.answer}">
              <span class="option-num">${["①", "②", "③", "④", "⑤"][i]}</span>
              <span>${escHtml(opt)}</span>
            </li>`
          ).join("") +
          `</ul>`;
      }

      const expHtml = q.explanation
        ? `<div class="q-explanation" id="exp-${questionNum}">
             <strong>해설:</strong> ${escHtml(q.explanation)}
           </div>`
        : "";

      card.innerHTML = `
        <div class="q-header">
          <div class="q-num">${questionNum}</div>
          <div class="q-text">${escHtml(q.question)}</div>
          <div class="q-points">[${q.points}점]</div>
        </div>
        ${passageHtml}
        ${optionsHtml}
        ${expHtml}
      `;
      wrap.appendChild(card);
      questionNum++;
    });
  });

  // 정답표 생성
  generateAiAnswerSheet(data);
}

function generateAiAnswerSheet(data) {
  const nums = ["①", "②", "③", "④", "⑤"];
  let html = `<h3>📋 정답표</h3><div class="answer-grid">`;

  let qNum = 1;
  data.forEach((roundData) => {
    if (roundData.questions) {
      roundData.questions.forEach((q) => {
        const ans = q.answer ? nums[q.answer - 1] : "서술형";
        html += `<div class="answer-item">
          <div class="a-num">${qNum}번</div>
          <div class="a-val">${ans}</div>
        </div>`;
        qNum++;
      });
    }
  });
  html += `</div>`;

  const sheet = document.getElementById("answerSheet");
  sheet.innerHTML = html;
  sheet.style.display = "block";
}

function showAiLoading() {
  document.getElementById("aiLoading").style.display = "block";
  document.getElementById("aiResult").style.display = "none";
  document.getElementById("aiError").style.display = "none";
  document.getElementById("questionsWrap").innerHTML = "";
}

function showAiResult() {
  document.getElementById("aiLoading").style.display = "none";
  document.getElementById("aiResult").style.display = "block";
  document.getElementById("aiError").style.display = "none";
}

function showAiError(message) {
  document.getElementById("aiLoading").style.display = "none";
  document.getElementById("aiResult").style.display = "none";
  document.getElementById("aiError").style.display = "block";
  document.getElementById("errorText").textContent = message;
}

function downloadQuestions() {
  const content = document.getElementById("questionsWrap").innerText;
  const blob = new Blob([content], { type: "text/plain; charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `예상문제_${new Date().getTime()}.txt`;
  link.click();
}
