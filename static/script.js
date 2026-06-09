let currentGrade = "2";
let currentRound = 1;
let answersVisible = false;
let questionsData = [];

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
