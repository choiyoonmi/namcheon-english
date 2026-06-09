let currentGrade = "2";
let currentTerm = "1";
let currentExamType = "중간";
let currentRound = 1;
let answersVisible = false;
let questionsData = [];
let extractedPdfText = "";

// PDF.js 초기화
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// 페이지 로드 시 AI 섹션 표시
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("aiSection").style.display = "block";

  // PDF 파일 입력 이벤트
  document.getElementById("pdfFile").addEventListener("change", handlePdfUpload);
});

// 시험 선택 버튼
document.querySelectorAll(".exam-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".exam-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentGrade = btn.dataset.grade;
    currentTerm = btn.dataset.term;
    currentExamType = btn.dataset.type;
  });
});

// ===== 기출문제 분석 =====

let extractedExamPdfText = "";
let examImageFiles = []; // 여러 이미지 저장

document.getElementById("examPdfFile")?.addEventListener("change", handleExamPdfUpload);

// 드래그 드롭 처리
const dragDropZone = document.getElementById("dragDropZone");

if (dragDropZone) {
  // 드래그 오버
  dragDropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dragDropZone.classList.add("drag-over");
  });

  dragDropZone.addEventListener("dragleave", () => {
    dragDropZone.classList.remove("drag-over");
  });

  // 드롭
  dragDropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDropZone.classList.remove("drag-over");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      document.getElementById("examPdfFile").files = files;
      handleExamPdfUpload({ target: { files: files } });
    }
  });

  // 클릭으로도 파일 선택 가능
  dragDropZone.addEventListener("click", () => {
    document.getElementById("examPdfFile").click();
  });
}

async function handleExamPdfUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const fileName = document.getElementById("examFileName");
  const fileProgress = document.getElementById("examFileProgress");
  const fileStatus = document.getElementById("examFileStatus");
  const analyzeBtn = document.getElementById("analyzeBtn");

  examImageFiles = Array.from(files);
  const fileNames = examImageFiles.map(f => f.name).join(", ");

  fileName.textContent = `준비 중: ${examImageFiles.length}개 파일`;
  fileName.style.display = "block";
  fileProgress.style.display = "block";
  analyzeBtn.disabled = false; // 여러 이미지는 즉시 분석 가능

  fileStatus.textContent = `${examImageFiles.length}개 파일 준비 완료`;
  document.getElementById("examFileProgressBar").style.width = "100%";

  fileName.textContent = `✅ ${examImageFiles.length}개 파일 준비 완료`;
  fileProgress.style.display = "none";
}

async function analyzeExamPdf() {
  if (!examImageFiles || examImageFiles.length === 0) {
    showAnalysisError("사진 파일을 선택해주세요.");
    return;
  }

  const grade = document.getElementById("analysisTarget").value;
  const round = document.getElementById("analysisRound").value;
  const selectCount = document.getElementById("analysisSelectCount").value;
  const difficulty = document.getElementById("analysisDifficulty").value;

  showAnalysisLoading();
  document.getElementById("analysisLoading").textContent = "OCR 처리 중입니다... (1-2분 소요)";

  try {
    // OCR로 텍스트 추출
    let extractedText = "";

    for (let i = 0; i < Math.min(examImageFiles.length, 2); i++) {
      const file = examImageFiles[i];
      const result = await Tesseract.recognize(file);
      extractedText += result.data.text + "\n";
    }

    if (!extractedText.trim()) {
      showAnalysisError("이미지에서 텍스트를 추출할 수 없습니다.");
      return;
    }

    // Node.js AI 서버로 전송
    const response = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfText: extractedText,
        grade: grade,
        round: round,
        difficulty: difficulty,
        usedIdioms: [],
        usedTypes: []
      })
    });

    if (!response.ok) {
      const error = await response.json();
      showAnalysisError(error.error || "분석에 실패했습니다.");
      return;
    }

    const result = await response.json();
    displayAnalysisResult(result);
    showAnalysisResult();
  } catch (e) {
    showAnalysisError("요청 중 오류가 발생했습니다: " + e.message);
  }
}

function displayAnalysisResult(result) {
  // 분석 결과를 문제지 형식으로 변환해서 표시
  if (!result.questions || result.questions.length === 0) {
    showAnalysisError("분석 결과에 문제가 없습니다.");
    return;
  }

  // questionsData에 결과 저장
  questionsData = result.questions.map((q, idx) => ({
    id: q.id || (idx + 1),
    type: q.type || "essay",
    question: q.question || "",
    answer: q.answer || "",
    explanation: q.explanation || "",
    points: q.points || 3,
    topic: q.topic || ""
  }));

  // 문제지 헤더 설정
  currentGrade = result.grade || "2";
  currentRound = result.round || "1";
  document.getElementById("examTitle").textContent = `${currentGrade}학년 기출문제 분석 (${currentRound}회차)`;
  document.getElementById("examSubtitle").textContent = `난이도: ${result.difficulty || "보통"}`;

  // 문제지 표시
  renderQuestions(questionsData);

  // 분석 섹션 숨기고 문제지 표시
  document.getElementById("analysisSection").style.display = "none";
  document.getElementById("analysisLoading").style.display = "none";
  document.getElementById("analysisResult").style.display = "none";
  document.getElementById("analysisError").style.display = "none";

  // 문제지 관련 UI 표시
  document.getElementById("examHeader").style.display = "block";
  document.getElementById("questionsWrap").style.display = "block";
  document.getElementById("emptyState").style.display = "none";
  document.getElementById("toggleAnswerBtn").style.display = "inline-block";
  document.getElementById("resetBtn").style.display = "inline-block";
}

function copyAnalysisResult() {
  const output = document.getElementById("analysisOutput").textContent;
  navigator.clipboard.writeText(output).then(() => {
    alert("결과가 클립보드에 복사되었습니다!\ngrade2_questions.py 또는 grade3_questions.py에 붙여넣으세요.");
  }).catch(() => {
    alert("복사 실패. 수동으로 텍스트를 선택해서 복사해주세요.");
  });
}

function resetAnalysis() {
  extractedExamPdfText = "";
  examImageFiles = [];
  document.getElementById("examPdfFile").value = "";
  document.getElementById("examFileName").style.display = "none";
  document.getElementById("examFileProgress").style.display = "none";
  document.getElementById("analysisLoading").style.display = "none";
  document.getElementById("analysisResult").style.display = "none";
  document.getElementById("analysisError").style.display = "none";

  // 문제지 숨기기
  document.getElementById("examHeader").style.display = "none";
  document.getElementById("questionsWrap").innerHTML = "";
  document.getElementById("questionsWrap").style.display = "none";
  document.getElementById("emptyState").style.display = "block";
  document.getElementById("toggleAnswerBtn").style.display = "none";
  document.getElementById("resetBtn").style.display = "none";
  document.getElementById("answerSheet").style.display = "none";

  // 분석 섹션 다시 표시
  document.getElementById("analysisSection").style.display = "block";
  document.getElementById("analysisSection").scrollIntoView({ behavior: "smooth" });
}

function showAnalysisLoading() {
  document.getElementById("analysisLoading").style.display = "block";
  document.getElementById("analysisResult").style.display = "none";
  document.getElementById("analysisError").style.display = "none";
}

function showAnalysisResult() {
  document.getElementById("analysisLoading").style.display = "none";
  document.getElementById("analysisResult").style.display = "block";
  document.getElementById("analysisError").style.display = "none";
}

function showAnalysisError(message) {
  document.getElementById("analysisLoading").style.display = "none";
  document.getElementById("analysisResult").style.display = "none";
  document.getElementById("analysisError").style.display = "block";
  document.getElementById("analysisErrorText").textContent = message;
}

// ===== AI 문제 생성 =====

// PDF 파일 업로드 처리
async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const fileName = document.getElementById("fileName");
  const fileProgress = document.getElementById("fileProgress");
  const fileStatus = document.getElementById("fileStatus");
  const generateBtn = document.getElementById("generateBtn");

  fileName.textContent = "처리 중: " + file.name;
  fileProgress.style.display = "block";
  generateBtn.disabled = true;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = "";
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
      fileStatus.textContent = `처리 중... (${i}/${totalPages} 페이지)`;
      document.getElementById("fileProgressBar").style.width = ((i / totalPages) * 100) + "%";

      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      text += textContent.items.map(item => item.str).join(" ") + "\n";
    }

    extractedPdfText = text;
    fileName.textContent = "✅ " + file.name + " (" + totalPages + " 페이지 처리 완료)";
    fileProgress.style.display = "none";
    generateBtn.disabled = false;
  } catch (error) {
    console.error("PDF 처리 오류:", error);
    fileName.textContent = "❌ 파일 처리 실패";
    fileProgress.style.display = "none";
    generateBtn.disabled = false;
    showAiError("PDF 파일을 읽을 수 없습니다. 올바른 PDF 파일인지 확인해주세요.");
  }
}

// Button selection
document.querySelectorAll(".round-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".round-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRound = parseInt(btn.dataset.round);
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

    const examTypeLabel = currentExamType === "중간" ? "중간고사" : "기말고사";
    document.getElementById("examTitle").textContent =
      `2026학년도 1학기 ${examTypeLabel} ${currentGrade}학년 영어과 예상문제`;
    document.getElementById("examSubtitle").textContent =
      `제${currentRound}회차`;

    document.getElementById("toggleAnswerBtn").style.display = "inline-flex";
    document.getElementById("resetBtn").style.display = "inline-flex";
    updateAnswerBtn();
  } catch (e) {
    document.getElementById("questionsWrap").innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><p>문제를 불러오지 못했습니다.<br>잠시 후 다시 시도해 주세요.</p></div>`;
  } finally {
    document.getElementById("loading").style.display = "none";
  }
}

function resetQuestions() {
  // 초기 상태로 복구
  document.getElementById("emptyState").style.display = "block";
  document.getElementById("questionsWrap").innerHTML = "";
  document.getElementById("answerSheet").style.display = "none";
  document.getElementById("examHeader").style.display = "none";
  document.getElementById("toggleAnswerBtn").style.display = "none";
  document.getElementById("resetBtn").style.display = "none";
  answersVisible = false;
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
    } else if (q.type === "essay") {
      optionsHtml = `
        <div class="q-essay">
          <div class="essay-label">서술형</div>
          <div class="essay-answer">정답: ${escHtml(q.answer)}</div>
          <div class="essay-topic">유형: ${escHtml(q.topic || "")}</div>
        </div>
      `;
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
  if (!extractedPdfText) {
    showAiError("PDF 파일을 선택해주세요.");
    return;
  }

  const difficulty = document.getElementById("aiDifficulty").value;
  const rounds = parseInt(document.getElementById("aiRounds").value);

  showAiLoading();

  try {
    const response = await fetch("/api/ai/generate-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfText: extractedPdfText,
        grade: currentGrade,
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
    renderAiQuestions(result.data, currentGrade, rounds, difficulty);
    showAiResult();
  } catch (e) {
    showAiError("요청 중 오류가 발생했습니다: " + e.message);
  }
}

function renderAiQuestions(data, grade, rounds, difficulty) {
  const wrap = document.getElementById("questionsWrap");
  wrap.innerHTML = "";

  // AI 생성 문제 헤더
  const examHeader = document.getElementById("examHeader");
  examHeader.style.display = "block";
  const examTypeLabel = currentExamType === "중간" ? "중간고사" : "기말고사";
  document.getElementById("examTitle").textContent =
    `2026학년도 1학기 ${examTypeLabel} ${currentGrade}학년 영어과 예상문제 (AI 생성)`;
  document.getElementById("examSubtitle").textContent =
    `난이도: ${difficulty} / 총 ${rounds}회차`;

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

function resetAiSection() {
  // AI 섹션 초기화
  extractedPdfText = "";
  document.getElementById("pdfFile").value = "";
  document.getElementById("fileName").textContent = "선택된 파일 없음";
  document.getElementById("fileProgress").style.display = "none";
  document.getElementById("questionsWrap").innerHTML = "";
  document.getElementById("answerSheet").style.display = "none";

  // UI 초기화
  document.getElementById("aiLoading").style.display = "none";
  document.getElementById("aiResult").style.display = "none";
  document.getElementById("aiError").style.display = "none";

  // 페이지 상단으로 스크롤
  document.getElementById("aiSection").scrollIntoView({ behavior: "smooth" });
}
