// ============ CONFIG ============
// (คงค่าเดิมทั้งหมด)
const GOOGLE_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfLXI7a3w8HBYE8C3WWrARwLc-2Xxf-F3sJBW2gGLWQ2RbNhA/viewform?embedded=true";
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbxMaWKkmnzeXlRUqYTLHmy18xyfR4OZPg9twtpSN1P2VflqFzgaIagQyjzkgJsl0geg/exec";

// ============ STATE ============
const state = {
  step: 1,
  consent: null,
  uid: localStorage.getItem("spst_uid") || null,
  user_id: localStorage.getItem("spst_user_id") || null,
  completed: localStorage.getItem("spst_completed") === "true" || false,
  answers: {},
  score: 0,
  interp: "",
  detail: "",
  choice: null,

  // เกม
  gameTab: null,
  gameFocusFinished: false,
  gameMemoryFinished: false,
  gameWaterFinished: false, // ✅ Water Sort
  get gameFinished() {
    return (
      this.gameFocusFinished || this.gameMemoryFinished || this.gameWaterFinished
    );
  },

  // สถานะ Water Sort
  ws: {
    diff: "easy", // "easy" | "medium" | "insane"
    level: 1,
    startTs: null,
    timerId: null,
    elapsedMs: 0,
    moves: 0,
    tubes: [],
  },
};

const stepsTotal = 10;
const bar = document.getElementById("bar");
const toastEl = document.getElementById("toast");

// ======== PERFORMANCE: preload & dedupe init ========
let inflightInit = null;
let uidReady = false;

(function prewarm() {
  try {
    fetch(WEB_APP_URL + "?ping=1", { mode: "no-cors", keepalive: true });
  } catch (_) {}
  ensureUid().catch(() => {});
})();

// ============ HELPERS ============
let toastTimer = null;

function showToast(msg = "", ms = 2000) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("hide");
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
    toastEl.classList.add("hide");
  }, ms);
}

function setStep(n) {
  if (n === state.step) return;
  state.step = n;
  document.querySelectorAll(".stage").forEach((el) => {
    el.classList.toggle("hide", +el.dataset.step !== n);
  });
  if (bar) bar.style.width = ((n - 1) / (stepsTotal - 1)) * 100 + "%";
  onStepEnter(n);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// fetch helper
async function fire(action, payload = {}, { retry = 0, timeoutMs = 6000 } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...payload }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(to);
    if (retry > 0) {
      await new Promise((r) => setTimeout(r, 350));
      return fire(action, payload, { retry: retry - 1, timeoutMs });
    }
    console.warn("fire failed:", action, e);
    return null;
  }
}

// ensureUid
async function ensureUid() {
  if (uidReady && state.uid && state.user_id) {
    return { uid: state.uid, user_id: state.user_id };
  }
  if (inflightInit) return inflightInit;

  inflightInit = (async () => {
    if (state.uid && state.user_id && !state.completed) {
      const resp = await fire("init", { uid: state.uid }, { retry: 0, timeoutMs: 4500 });
      if (resp && resp.ok) {
        state.completed = !!resp.completed;
        localStorage.setItem("spst_completed", state.completed.toString());
        uidReady = true;
        return { uid: state.uid, user_id: state.user_id };
      }
    }
    const resp2 = await fire("init", { uid: state.uid || null }, { retry: 1, timeoutMs: 6000 });
    if (resp2 && resp2.ok) {
      state.uid = resp2.uid;
      state.user_id = resp2.user_id;
      state.completed = !!resp2.completed;
      localStorage.setItem("spst_uid", state.uid);
      localStorage.setItem("spst_user_id", state.user_id);
      localStorage.setItem("spst_completed", state.completed.toString());
      uidReady = true;
      return { uid: state.uid, user_id: state.user_id };
    }
    uidReady = false;
    throw new Error("init failed");
  })();

  try {
    return await inflightInit;
  } finally {
    inflightInit = null;
  }
}

// ============ STEP HOOK ============
function onStepEnter(n) {
  if (n === 6) {
    if (state.choice) highlightSelectedChip(state.choice);
    const go = document.getElementById("goChoice");
    if (go) go.disabled = !state.choice;
  }

  if (n === 7) {
    renderMethod();
    manageNextButtonInStep7();
  }

  if (n === 9) {
    const f = document.getElementById("gform");
    if (f && !f.src) f.src = GOOGLE_FORM_URL;
    const chk = document.getElementById("formDoneChk");
    const btn = document.getElementById("formNextBtn");
    if (chk) chk.checked = false;
    if (btn) btn.disabled = true;
  }

  if (n === 10) {
    const summaryOut = document.getElementById("summaryOut");
    const completedMsg = document.getElementById("completedMsg");
    const answered = Object.keys(state.answers).length;
    if (summaryOut) {
      summaryOut.innerHTML = `
        <div><strong>สรุปผลของคุณ</strong></div>
        <div>ยินยอมทำแบบประเมิน: <strong>${
          state.consent ? "ยินยอม" : "ไม่ยินยอม"
        }</strong></div>
        ${
          state.consent
            ? `<div>คะแนน SPST-20: <strong>${state.score}</strong> | <span>${state.interp}</span></div>
               <div style="margin-top:8px" class="muted">${state.detail}</div>
               <div>ตอบจริง: ${answered} / 20 ข้อ</div>`
            : `<div class="muted">คุณเลือกไม่ทำแบบประเมิน ระบบได้พาไปส่วนวิธีจัดการแทน</div>`
        }
      `;
    }
    if (completedMsg) {
      completedMsg.style.display = state.completed ? "block" : "none";
    }
  }
}

// ============ NAVIGATION ============
document.getElementById("startBtn")?.addEventListener("click", () => {
  setStep(2);
  ensureUid().catch(() =>
    showToast("โหมดออฟไลน์ชั่วคราว — จะซิงค์ให้อัตโนมัติเมื่อเน็ตกลับมา")
  );
});

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const dir = e.currentTarget.dataset.nav;
    if (dir === "back") setStep(Math.max(1, state.step - 1));
    if (dir === "next") setStep(Math.min(stepsTotal, state.step + 1));
  });
});

// ============ CONSENT HANDLING ============
document.getElementById("consentYes")?.addEventListener("click", async () => {
  if (state.completed) {
    showToast("คุณทำแบบประเมินครบแล้ว");
    setStep(10);
    return;
  }
  state.consent = true;
  setStep(3);
  try {
    const { uid } = await ensureUid();
    fire("saveConsent", { uid, consent: true });
  } catch (_) {}
});

document.getElementById("consentNo")?.addEventListener("click", async () => {
  if (state.completed) {
    showToast("คุณทำแบบประเมินครบแล้ว");
    setStep(10);
    return;
  }
  state.consent = false;
  setStep(5);
  try {
    const { uid } = await ensureUid();
    fire("saveConsent", { uid, consent: false });
  } catch (_) {}
});

// ============ JUMPERS ============
document.querySelector('[data-go="questions"]')?.addEventListener("click", () =>
  setStep(4)
);
document.querySelector('[data-go="manage"]')?.addEventListener("click", () =>
  setStep(6)
);
document.querySelector('[data-go="form"]')?.addEventListener("click", () => {
  const f = document.getElementById("gform");
  if (f) f.src = GOOGLE_FORM_URL;
  setStep(9);
});

// ============ QUESTIONS ============
const items = [
  "กลัวทำงานผิดพลาด",
  "ไปไม่ถึงเป้าหมายที่วางไว้",
  "ครอบครัวมีความขัดแย้งกันในเรื่องเงินหรือเรื่องงานในบ้าน",
  "กังวลเรื่องมลภาวะ/สารพิษ (อากาศ น้ำ เสียง ดิน)",
  "รู้สึกว่าต้องแข่งขันหรือเปรียบเทียบ",
  "เงินไม่พอใช้จ่าย",
  "กล้ามเนื้อตึงหรือปวด",
  "ปวดหัวจากความตึงเครียด",
  "ปวดหลัง",
  "ความอยากอาหารเปลี่ยนแปลง",
  "ปวดศีรษะข้างเดียว",
  "รู้สึกวิตกกังวล",
  "รู้สึกคับข้องใจ",
  "รู้สึกโกรธ หรือหงุดหงิด",
  "รู้สึกเศร้า",
  "ความจำไม่ดี",
  "รู้สึกสับสน",
  "ตั้งสมาธิลำบาก",
  "รู้สึกเหนื่อยง่าย",
  "เป็นหวัดบ่อย ๆ",
];

const questionsDiv = document.getElementById("questions");
if (questionsDiv) {
  items.forEach((t, i) => {
    const idx = i + 1;
    const q = document.createElement("div");
    q.className = "q";
    q.id = `qbox-${idx}`;
    q.innerHTML = `
<h4>${idx}. ${t}</h4>
<div class="scale" role="radiogroup" aria-label="ระดับความเครียด ข้อที่ ${idx}">
  ${[
    "1. ไม่รู้สึกเครียด",
    "2. เครียดเล็กน้อย",
    "3. เครียดปานกลาง",
    "4. เครียดมาก",
    "5. เครียดมากที่สุด",
  ]
    .map(
      (lab, valIdx) =>
        `<label><input type="radio" name="q${idx}" value="${valIdx + 1}" /><span>${lab}</span></label>`
    )
    .join("")}
</div>`;
    questionsDiv.appendChild(q);

    q.addEventListener("change", (e) => {
      if (e.target.name === `q${idx}`) state.answers[idx] = +e.target.value;
    });
  });
}

const levelDetails = {
  low: `ท่านมีความเครียดอยู่ในระดับน้อยและหายไปได้ในระยะเวลาสั้น ๆ เป็นความเครียดที่เกิดขึ้นได้ในชีวิตประจำวันและสามารถปรับตัวกับสถานการณ์ต่าง ๆ ได้อย่างเหมาะสม ความเครียดในระดับนี้ถือว่ามีประโยชน์ในการดำเนินชีวิตประจำวัน เป็นแรงจูงใจในที่นำไปสู่ความสำเร็จในชีวิตได้`,
  moderate: `ท่านมีความเครียดในระดับปานกลางเกิดขึ้นได้ในชีวิตประจำวันเนื่องจากมีสิ่งคุกคามหรือ เหตุการณ์ที่ทำให้เครียด อาจรู้สึกวิตกกังวลหรือกลัว ถือว่าอยู่ในเกณฑ์ปกติ ความเครียดระดับนี้ไม่ก่อให้เกิดอันตรายหรือเป็นผลเสีย ต่อการดำเนินชีวิต ท่านสามารถผ่อนคลายความเครียดด้วยการทำกิจกรรมที่เพิ่มพลัง เช่น ออกกำลังกาย เล่นกีฬาทำสิ่งที่สนุกสนานเพลิดเพลิน เช่น ฟังเพลง อ่านหนังสือ ทำงานอดิเรก หรือพูดคุยระบายความไม่สบายใจ กับผู้ที่ไว้วางใจ`,
  high: `ท่านมีความเครียดในระดับสูง เป็นระดับที่ท่านได้รับความเดือนร้อนจากสิ่งต่าง ๆ หรือเหตุการณ์ รอบตัวทำให้วิตกกังวล กลัว รู้สึกขัดแย้งหรืออยู่ในสถานการณ์ที่แก้ไข จัดการปัญหานั้นไม่ได้ ปรับความรู้สึกด้วยความลำบากจะส่งผลต่อการใช้ชีวิตประจำวัน และการเจ็บป่วย เช่น ความดันโลหิตสูง เป็นแผลในกระเพาะอาหาร ฯลฯ สิ่งที่ท่านต้องรีบทำเมื่อมีความเครียดในระดับนี้คือ คลายเครียดด้วยวิธีที่ทำได้ง่ายแต่ได้ผลดีคือ การฝึกหายใจ คลายเครียด พูดคุยระบายความเครียดกับผู้ไว้วางใจ หาสาเหตุหรือปัญหาที่ทำให้เครียดและหาวิธีแก้ไขหากท่านไม่สามารถจัดการคลายเครียดด้วยตนเองได้ ควรปรึกษากับผู้ให้การปรึกษาในหน่วยงานต่าง ๆ`,
  severe: `ท่านมีความเครียดในระดับรุนแรง เป็นความเครียดระดับสูงที่เกิดต่อเนื่องหรือท่านกำลังเผชิญกับวิกฤตของ ชีวิต เช่น เจ็บป่วยรุนแรง เรื้อรังมีความพิการ สูญเสียคนรัก ทรัพย์สินหรือสิ่งที่รัก ความเครียดระดับนี้ส่งผลทำให้เจ็บป่วยทางกายและสุขภาพจิต ชีวิตไม่มีความสุข ความคิดฟุ้งช่าน การตัดสินใจไม่ดี ยับยั้งอารมณ์ไม่ได้ ความเครียดระดับนี้ถ้าปล่อยไว้จะเกิดผลเสียทั้งต่อตนเองและคนใกล้ชิด ควรได้รับการช่วยเหลือจาก ผู้ให้การปรึกษาอย่างรวดเร็ว เช่น ทางโทรศัพท์ หรือผู้ให้การปรึกษาในหน่วยงานต่าง ๆ`,
};

const scoreBox = document.getElementById("scoreBox");

function openAlertModal(title = "โปรดตรวจสอบ", msg = "") {
  const m = document.getElementById("ggModal");
  if (!m) return;
  m.querySelector(".modal-emoji").textContent = "⚠️";
  m.querySelector(".modal-title").textContent = title;
  m.querySelector(".modal-desc").textContent = msg;
  m.classList.remove("hide");
}

function closeAlertModalReset() {
  const m = document.getElementById("ggModal");
  if (!m) return;
  m.querySelector(".modal-emoji").textContent = "🎉";
  m.querySelector(".modal-title").textContent = "เยี่ยมมาก!";
  m.querySelector(".modal-desc").textContent =
    "คุณเล่นเกมจบแล้ว สามารถไปขั้นถัดไปได้";
}

document.getElementById("calcBtn")?.addEventListener("click", async () => {
  if (state.completed) {
    showToast("คุณทำแบบประเมินครบแล้ว");
    setStep(10);
    return;
  }

  const missing = [];
  for (let i = 1; i <= 20; i++) if (!state.answers[i]) missing.push(i);

  if (missing.length) {
    const first = missing[0];
    const target = document.getElementById(`qbox-${first}`);
    if (target)
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    openAlertModal(
      "ยังตอบไม่ครบ",
      `คุณยังไม่ได้ตอบข้อ: ${missing.join(", ")}\nกรุณาตอบให้ครบทั้ง 20 ข้อ`
    );
    document.getElementById("closeModal").onclick = () => {
      document.getElementById("ggModal").classList.add("hide");
      closeAlertModalReset();
    };
    return;
  }

  let sum = 0;
  Object.values(state.answers).forEach((v) => (sum += v));
  state.score = sum;

  let interp = "",
    tag = "",
    detail = "";
  if (sum <= 23) {
    interp = "ระดับน้อย";
    tag = "ok";
    detail = levelDetails.low;
  } else if (sum <= 41) {
    interp = "ระดับปานกลาง";
    tag = "warn";
    detail = levelDetails.moderate;
  } else if (sum <= 61) {
    interp = "ระดับสูง";
    tag = "bad";
    detail = levelDetails.high;
  } else {
    interp = "ระดับรุนแรง";
    tag = "bad";
    detail = levelDetails.severe;
  }

  state.interp = interp;
  state.detail = detail;

  const severeHelp =
    sum >= 62
      ? `
    <div class="helpbox" style="margin-top:12px">
      <strong>ต้องการความช่วยเหลือด่วน?</strong>
      <ul style="margin:8px 0 0 18px">
        <li>สายด่วนสุขภาพจิต <strong>1323</strong> (ฟรี 24 ชม.) – กรมสุขภาพจิต</li>
        <li>สายด่วน <strong>1669</strong> (การแพทย์ฉุกเฉิน)</li>
        <li>ช่องทางออนไลน์ <strong>LINE</strong> และ <strong>Facebook Fanpage 1323</strong></li>
      </ul>
      <div class="btns">
        <a class="primary btn" href="https://www.facebook.com/helpline1323/?locale=th_TH" target="_blank" rel="noopener">ดูรายละเอียด</a>
      </div>
      <br><br>
      <div class="small muted">หมายเหตุ: หากมีความเสี่ยง หรือมีอันตรายต่อชีวิต กรุณาติดต่อสายด่วนทันที</div>
    </div>`
      : "";

  if (scoreBox) {
    scoreBox.classList.remove("hide");
    scoreBox.innerHTML = `
      <div><strong>คะแนนรวม:</strong> ${sum} คะแนน</div>
      <div>การแปลผล: <strong class="tag-${tag}">${interp}</strong></div>
      <div class="muted" style="margin-top:6px;white-space:pre-line">${detail}</div>
      ${severeHelp}
      <div class="btns" style="margin-top:10px"><button class="primary" id="toPart2">ไปส่วนที่ 2</button></div>
    `;
  }

  document.getElementById("toPart2")?.addEventListener("click", () => setStep(5));

  ensureUid()
    .then(({ uid }) =>
      fire("saveAssessment", {
        uid,
        score: state.score,
        level: state.interp,
        answers: state.answers,
      })
    )
    .catch(() => {});
});

// ============ PART 2 (CHOICES) ============
const choiceContainer = document.getElementById("choiceChips");
const goChoiceBtn = document.getElementById("goChoice");

choiceContainer?.querySelectorAll(".chip").forEach((ch) => {
  ch.addEventListener("click", () => {
    if (state.completed) {
      showToast("คุณทำแบบประเมินครบแล้ว");
      setStep(10);
      return;
    }
    const choice = ch.dataset.choice;
    state.choice = choice;
    highlightSelectedChip(choice);
    if (goChoiceBtn) goChoiceBtn.disabled = false;
    ensureUid()
      .then(({ uid }) => fire("saveChoice", { uid, choice }))
      .catch(() => {});
  });
});

goChoiceBtn?.addEventListener("click", () => {
  if (!state.choice) {
    showToast("⚠️ กรุณาเลือกแนวทางคลายเครียดก่อน");
    return;
  }
  if (state.completed) {
    showToast("คุณทำแบบประเมินครบแล้ว");
    setStep(10);
    return;
  }
  setStep(7);
});

function highlightSelectedChip(choice) {
  choiceContainer?.querySelectorAll(".chip").forEach((el) =>
    el.classList.toggle("selected", el.dataset.choice === choice)
  );
}

// ============ METHOD RENDER (ตามเลือก) ============
const methodPane = document.getElementById("methodPane");
const gameTabs = document.getElementById("gameTabs");
const memoryPane = document.getElementById("memoryPane");
const focusPane = document.getElementById("focusPane");
const nextFrom7 = document.getElementById("nextFrom7");
const gameWarn = document.getElementById("gameWarn");

function clearGamePanes() {
  memoryPane?.classList.add("hide");
  focusPane?.classList.add("hide");
  if (focusPane) focusPane.innerHTML = "";
  const grid = document.getElementById("matchGrid");
  if (grid) grid.innerHTML = "";
  const wsPane = document.getElementById("wsPane");
  if (wsPane) wsPane.remove();
}

function renderMethod() {
  const c = state.choice;
  if (!methodPane) return;
  methodPane.innerHTML = "";
  clearGamePanes();

  if (!c) {
    methodPane.innerHTML = "<p class='muted'>ยังไม่ได้เลือกวิธี</p>";
    return;
  }

  if (c === "music") {
    gameTabs?.classList.add("hide");
    methodPane.innerHTML = `
  <h3>ฟังเพลงผ่อนคลาย</h3>
  <p class="muted">ตัวอย่างจาก YouTube (แนะนำให้ฟังด้วยหูฟังในบรรยากาศเงียบ)</p>
  <!-- เพลงเดิมตัวแรก (คงไว้) -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/dhFt7eURm78?rel=0" title="เพลงผ่อนคลาย (จาก SDS Channel)" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิต: <a href="https://www.youtube.com/channel/UCqYyUNmDjATVjb56regwDqw" target="_blank" rel="noopener">เสถียรธรรมสถาน SDS Channel</a>
  </div>
  <!-- เพลงใหม่ #3: Airstream – Electra -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/hGUGqLy46l0?rel=0" title="Airstream - Electra" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตช่อง: <a href="https://www.youtube.com/channel/UC6RmHSIXCpKdiJvhWDyBy7g" target="_blank" rel="noopener">สามเณร ปลูกปัญญาธรรม - True Little Monk</a>
  </div>
  <!-- เพลงล้านนาบรรเลง -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/FURSNRbdEvU?rel=0" title="รวมเพลงไทยบรรเลง ล้านนา" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตช่อง: <a href="https://www.youtube.com/channel/UCfugVsJm7euS3dWLju-we0A" target="_blank" rel="noopener">ดนตรีแบบดั้งเดิม ThaiLan</a>
  </div>
  <div class="result" style="margin-top:12px">
    <strong>อ้างอิง</strong><br>
    • บทความ: CMU Journal — <a href="https://cmuj.cmu.ac.th/nlsc/journal/article/884" target="_blank" rel="noopener">คลิกอ่าน</a><br>
  </div>
  <!-- เพลงใหม่ #2: DJ Shah – Mellomaniac (Chillout Mix) -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/cWxoz-vuTCs?rel=0" title="DJ Shah - Mellomaniac (Chillout Mix)" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตช่อง: <a href="https://www.youtube.com/channel/UCqYyUNmDjATVjb56regwDqw" target="_blank" rel="noopener">เสถียรธรรมสถาน SDS Channel</a>
  </div>
  <!-- เพลงใหม่ #1: DJ Shah – Mellomaniac (Chillout Mix) -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/UfcAVejslrU?rel=0" title="DJ Shah - Mellomaniac (Chillout Mix)" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตช่อง: <a href="https://www.youtube.com/channel/UC6Q2ZkwzOjbeMEhLJNpZKaA" target="_blank" rel="noopener">JustMusicTV</a>
  </div>`;
    return;
  }


  if (c === "breath") {
    gameTabs?.classList.add("hide");
    methodPane.innerHTML = `
<h3>ฝึกหายใจแบบ 4–4–6</h3>
<div class="circle-breathe" id="breathCircle">
  <div class="label-center" id="breathLabel">พร้อม…</div>
</div>
<div class="label-center">รอบละ ~14 วินาที • ลองอย่างน้อย 6–10 รอบ</div>
<div class="btns" style="justify-content:center">
  <button class="ghost" id="breathStart">เริ่มฝึก</button>
  <button class="subtle" id="breathStop">หยุด</button>
</div>`;
    setupBreathing();
    return;
  }

    if (c === "video") {
      gameTabs?.classList.add("hide");
      methodPane.innerHTML = `
  <h3>วิดีโอผ่อนคลาย</h3>
  <!-- วิดีโอเดิม -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe title="LIVE Soothing Relaxation" src="https://www.youtube.com/embed/2OEL4P1Rz04?rel=0" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิต: <a href="https://www.youtube.com/@SoothingRelaxation" target="_blank" rel="noopener">Soothing Relaxation</a>
  </div>
  <!-- เพลงเดิม #1 เป็นวิดีโอ -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/HAzZH6wccew?rel=0" title="สายน้ำธรรมชาติ" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตเดิม: <a href="https://www.youtube.com/@healingwatersound" target="_blank" rel="noopener">Healing water sound ch</a>
  </div>
  <!-- เพลงเดิม #2 เป็นวิดีโอ -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/hlWiI4xVXKY?rel=0" title="Soothing Relaxation - เพลงบรรเลง" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตเดิม: <a href="https://www.youtube.com/@SoothingRelaxation" target="_blank" rel="noopener">Soothing Relaxation</a>
  </div>
  <!-- วิดีโอใหม่ #1 -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/UM-T9rtuUm8?rel=0" title="Realign, Sunshine — Maselle Meditation" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตช่อง: <a href="https://www.youtube.com/@MaselleMeditation" target="_blank" rel="noopener">Maselle Meditation</a>
  </div>
  <!-- วิดีโอใหม่ #2 -->
  <div style="position:relative;padding-top:56.25%;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:6px">
    <iframe src="https://www.youtube.com/embed/1GzKYoyrlkA?rel=0" title="เสียงธรรมชาติป่า/สายน้ำ" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
  </div>
  <div class="small muted" style="margin-bottom:12px">
    เครดิตช่อง: <a href="https://www.youtube.com/channel/UCNxq4kntqDqjvEm9UAU5NiA" target="_blank" rel="noopener">Streaming Birds</a>
  </div>
  <div class="result" style="margin-top:12px">
    <strong>อ้างอิง</strong><br>
    • วารสาร: Frontiers in Psychology (2022), Health Psychology section — <a href="https://pubmed.ncbi.nlm.nih.gov/35756241/" target="_blank" rel="noopener">คลิกอ่าน</a><br>
  </div>`;
      return;
    }


  if (c === "game") {
    // ✅ เติมแท็บ Water Sort
    if (gameTabs) {
      gameTabs.classList.remove("hide");
      gameTabs.innerHTML = `
        <button class="subtle" data-game-tab="focus">เกมโฟกัสสายตา</button>
        <button class="subtle" data-game-tab="memory">เกมจับคู่ภาพ</button>
        <button class="subtle" data-game-tab="watersort">Water Sort</button>
      `;
    }
    methodPane.innerHTML =
      '<div class="result">เลือกเกมที่ต้องการเล่นจากแท็บด้านบน</div>';
    setupGameTabs();
    return;
  }
}

function manageNextButtonInStep7() {
  if (!nextFrom7 || !gameWarn) return;
  if (state.choice === "game") {
    if (state.gameFinished) {
      nextFrom7.disabled = false;
      gameWarn.classList.add("hide");
    } else {
      nextFrom7.disabled = true;
      gameWarn.classList.remove("hide");
    }
  } else {
    nextFrom7.disabled = false;
    gameWarn.classList.add("hide");
  }
}

// ============ GAME TABS ============
function setupGameTabs() {
  const btnFocus = document.querySelector('[data-game-tab="focus"]');
  const btnMemory = document.querySelector('[data-game-tab="memory"]');
  const btnWater = document.querySelector('[data-game-tab="watersort"]');

  if (btnFocus) {
    btnFocus.onclick = () => {
      state.gameTab = "focus";
      showFocusGameOnly();
    };
  }
  if (btnMemory) {
    btnMemory.onclick = () => {
      state.gameTab = "memory";
      showMemoryGameOnly();
    };
  }
  if (btnWater) {
    btnWater.onclick = () => {
      state.gameTab = "watersort";
      showWaterSortOnly();
    };
  }
}

function showFocusGameOnly() {
  methodPane.innerHTML = "";
  memoryPane?.classList.add("hide");
  focusPane?.classList.remove("hide");
  renderFocusGame();
  manageNextButtonInStep7();
}

function showMemoryGameOnly() {
  methodPane.innerHTML = "";
  focusPane?.classList.add("hide");
  memoryPane?.classList.remove("hide");
  renderMemoryGame();
  manageNextButtonInStep7();
}

function showWaterSortOnly() {
  methodPane.innerHTML = "";
  focusPane?.classList.add("hide");
  memoryPane?.classList.add("hide");
  renderWaterSortGame();
  manageNextButtonInStep7();
}

// ============ FOCUS GAME ============
function renderFocusGame() {
  if (!focusPane) return;
  focusPane.innerHTML = `
<h3>เกมโฟกัสสายตา</h3>
<p class="muted">คลิกที่วงกลมเท่าที่หาได้ใน 20 วินาที</p>
<div id="gameArea" style="position:relative;height:260px;border:1px solid #e5e7eb;border-radius:12px;margin-top:8px;background:#fff"></div>
<div class="btns">
  <button class="ghost" id="gameStart">เริ่มเกม</button>
  <span id="gameInfo" class="muted"></span>
</div>`;
  setupGame();
}

function setupGame() {
  const area = document.getElementById("gameArea");
  const info = document.getElementById("gameInfo");
  if (!area || !info) return;

  area.innerHTML = "";
  let score = 0,
    time = 20,
    running = false,
    tInt = null,
    sInt = null;

  function spawn() {
    if (!running) return;
    const dot = document.createElement("div");
    const s = 24;
    const x = Math.random() * (area.clientWidth - s);
    const y = Math.random() * (area.clientHeight - s);
    dot.style.cssText = `position:absolute; left:${x}px; top:${y}px; width:${s}px; height:${s}px; border-radius:999px; background:#2563eb; cursor:pointer;`;
    dot.addEventListener("click", () => {
      score++;
      dot.remove();
    });
    area.appendChild(dot);
    setTimeout(() => dot.remove(), 1400);
  }

  function stop() {
    running = false;
    clearInterval(tInt);
    clearInterval(sInt);
    info.textContent = `จบเกม • ได้ ${score} วง`;
    state.gameFocusFinished = true;
    openCongratsModal();
    manageNextButtonInStep7();
    ensureUid().then(({ uid }) =>
      fire("saveGame", { uid, game: "focus", score })
    );
  }

  document.getElementById("gameStart").onclick = () => {
    score = 0;
    time = 20;
    area.innerHTML = "";
    running = true;
    info.textContent = `เวลา ${time}s | คะแนน ${score}`;
    clearInterval(tInt);
    clearInterval(sInt);

    tInt = setInterval(() => {
      time--;
      info.textContent = `เวลา ${time}s | คะแนน ${score}`;
      if (time <= 0) stop();
    }, 1000);
    sInt = setInterval(spawn, 450);
  };
}

// ============ MEMORY GAME ============
function renderMemoryGame() {
  initMemoryGame();
}

function initMemoryGame() {
  const grid = document.getElementById("matchGrid");
  if (!grid) return;

  const icons = ["🍎", "🍌", "🍇", "🍒", "🥝", "🍍", "🍉", "🍑"];
  let cards = [...icons, ...icons].sort(() => 0.5 - Math.random());

  grid.innerHTML = "";
  let flipped = [];
  let locked = false;
  let matched = 0;

  cards.forEach((icon) => {
    const card = document.createElement("div");
    card.classList.add("card");
    card.dataset.icon = icon;
    card.addEventListener("click", flip);
    grid.appendChild(card);
  });

  function flip() {
    if (locked) return;
    if (this.classList.contains("matched") || this.classList.contains("flipped"))
      return;
    if (flipped.length >= 2) return;

    this.classList.add("flipped");
    this.textContent = this.dataset.icon;
    flipped.push(this);

    if (flipped.length === 2) {
      locked = true;
      setTimeout(check, 800);
    }
  }

  function check() {
    const [a, b] = flipped;
    if (a && b && a.dataset.icon === b.dataset.icon) {
      a.classList.add("matched");
      b.classList.add("matched");
      matched += 2;
      if (matched === cards.length) {
        state.gameMemoryFinished = true;
        openCongratsModal();
        manageNextButtonInStep7();
        ensureUid().then(({ uid }) =>
          fire("saveGame", { uid, game: "memory", score: matched / 2 })
        );
      }
    } else {
      if (a) {
        a.classList.remove("flipped");
        a.textContent = "";
      }
      if (b) {
        b.classList.remove("flipped");
        b.textContent = "";
      }
    }
    flipped = [];
    locked = false;
  }

  const resetBtn = document.getElementById("resetMemory");
  if (resetBtn) resetBtn.onclick = () => initMemoryGame();
}

// ============ BREATHING EXERCISE ============
function setupBreathing() {
  const circle = document.getElementById("breathCircle");
  const label = document.getElementById("breathLabel");
  if (!circle || !label) return;

  let timer = null;
  let phase = 0;
  const seq = [
    { text: "หายใจเข้า… 4 วินาที", scale: 1.15, dur: 4000 },
    { text: "กลั้นไว้… 4 วินาที", scale: 1.15, dur: 4000 },
    { text: "ผ่อนลมหายใจออก… 6 วินาที", scale: 1.0, dur: 6000 },
  ];

  const tick = () => {
    const p = seq[phase % seq.length];
    circle.style.transform = `scale(${p.scale})`;
    label.textContent = p.text;
    timer = setTimeout(() => {
      phase++;
      tick();
    }, p.dur);
  };

  document.getElementById("breathStart").onclick = () => {
    if (timer) clearTimeout(timer);
    phase = 0;
    tick();
  };
  document.getElementById("breathStop").onclick = () => {
    if (timer) clearTimeout(timer);
    label.textContent = "พักหายใจตามสบาย";
    circle.style.transform = "scale(1)";
  };
}

// ============ MODAL HANDLING ============
const ggModal = document.getElementById("ggModal");
const closeModalBtn = document.getElementById("closeModal");

function openCongratsModal() {
  ggModal?.classList.remove("hide");
}

function closeCongratsModal() {
  ggModal?.classList.add("hide");
}

closeModalBtn?.addEventListener("click", () => {
  closeCongratsModal();
  closeAlertModalReset();
});

ggModal?.addEventListener("click", (e) => {
  if (e.target === ggModal) {
    closeCongratsModal();
    closeAlertModalReset();
  }
});

// ============ GOOGLE FORM CONFIRM ============
const formDoneChk = document.getElementById("formDoneChk");
const formNextBtn = document.getElementById("formNextBtn");

formDoneChk?.addEventListener("change", () => {
  if (formNextBtn) formNextBtn.disabled = !formDoneChk.checked;
  if (formDoneChk.checked) {
    showToast("✅ ยืนยันการส่งแบบฟอร์มแล้ว");
    ensureUid().then(({ uid }) => fire("saveFormDone", { uid, done: true }));
  } else {
    ensureUid().then(({ uid }) => fire("saveFormDone", { uid, done: false }));
  }
});

// ============ RESTART ============
document.getElementById("restart")?.addEventListener("click", () => {
  localStorage.removeItem("spst_uid");
  localStorage.removeItem("spst_user_id");
  localStorage.removeItem("spst_completed");
  location.reload();
});

// ============ INIT ============
setupGameTabs();

/* ======================================================================
   WATER SORT PUZZLE — ด่าน/ความยาก/จับเวลา/คะแนน/Popup + แก้บั๊กเลือกหลอด
   ====================================================================== */

// ค่าพื้นฐาน
const tubeCapacity = 4;
const COLOR_POOL = [
  "#ef4444", "#f59e0b", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6",
  "#84cc16", "#f97316", "#10b981", "#0ea5e9", "#a855f7"
];

// โปรไฟล์ความยาก
const DIFFS = {
  easy:   { colors: 5, empties: 2 },
  medium: { colors: 7, empties: 2 },
  insane: { colors: 9, empties: 2 }, // “ยากสุดๆ”
};

// UI + ลอจิกหลัก
function renderWaterSortGame() {
  const host = document.createElement("div");
  host.id = "wsPane";
  host.innerHTML = `
    <h3>Water Sort Puzzle</h3>
    <div class="result" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <label class="small">ความยาก:</label>
      <select id="wsDiff">
        <option value="easy">ง่าย</option>
        <option value="medium">ปานกลาง</option>
        <option value="insane">ยากสุดๆ</option>
      </select>
      <div class="small">ด่าน: <span id="wsLevel">1</span></div>
      <div class="small">เวลา: <span id="wsTime">00:00.0</span></div>
      <div class="small">ขยับ: <span id="wsMoves">0</span></div>
    </div>
    <div id="wsBoard" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:12px"></div>
    <div class="btns">
      <button class="ghost" id="wsStart">เริ่มด่าน</button>
      <button class="subtle" id="wsRestart" disabled>เริ่มด่านเดิม</button>
      <button class="subtle" id="wsNext" disabled>ด่านถัดไป</button>
    </div>
    <div class="small muted">วิธีเล่น: แตะหลอดต้นทาง แล้วแตะหลอดปลายทาง สีด้านบนจะเทไปตามกติกา</div>
  `;
  methodPane.appendChild(host);

  const selDiff = document.getElementById("wsDiff");
  const elLevel = document.getElementById("wsLevel");
  const elTime  = document.getElementById("wsTime");
  const elMoves = document.getElementById("wsMoves");
  const elBoard = document.getElementById("wsBoard");
  const btnStart = document.getElementById("wsStart");
  const btnRestart = document.getElementById("wsRestart");
  const btnNext = document.getElementById("wsNext");

  // ==== เก็บสถานะ "หลอดที่ถูกเลือก" ให้คงอยู่ข้าม render ====
  let selectedIdx = null;

  // init ค่า UI จาก state
  selDiff.value = state.ws.diff;
  elLevel.textContent = state.ws.level.toString();
  elTime.textContent = fmtMs(state.ws.elapsedMs);
  elMoves.textContent = state.ws.moves.toString();

  // อัปเดตความยาก
  selDiff.onchange = () => {
    state.ws.diff = selDiff.value;
    // เปลี่ยนความยากแล้วเริ่มใหม่ตั้งแต่เลเวล 1
    state.ws.level = 1;
    elLevel.textContent = "1";
    resetTimer();
    state.ws.moves = 0;
    elMoves.textContent = "0";
    state.ws.tubes = [];
    elBoard.innerHTML = `<div class="muted">กด "เริ่มด่าน" เพื่อสร้างกระดาน</div>`;
    btnRestart.disabled = true;
    btnNext.disabled = true;
    selectedIdx = null;
  };

  // ปุ่มเริ่ม
  btnStart.onclick = () => {
    buildLevel();
    btnRestart.disabled = false;
    btnNext.disabled = true;
  };

  // ปุ่มเริ่มด่านเดิม
  btnRestart.onclick = () => {
    if (!state.ws.tubes || state.ws.tubes.length === 0) {
      buildLevel();
    } else {
      buildLevel(); // รีบิลด์ให้สดสะอาด
    }
    btnNext.disabled = true;
  };

  // ปุ่มด่านถัดไป
  btnNext.onclick = () => {
    advanceLevel();
    buildLevel();
    btnNext.disabled = true;
  };

  // ถ้ายังไม่มีบอร์ด แสดงข้อความบอกเริ่มก่อน
  elBoard.innerHTML = `<div class="muted">กด "เริ่มด่าน" เพื่อสร้างกระดาน</div>`;

  // ==== ฟังก์ชันย่อยของ Water Sort ====

  function buildLevel() {
    resetTimer();
    state.ws.moves = 0;
    elMoves.textContent = "0";
    selectedIdx = null;

    const cfgBase = DIFFS[state.ws.diff] || DIFFS.easy;
    // เพิ่มจำนวนสีทุกๆ 2 ด่านแบบนุ่ม ๆ แต่ไม่เกินขนาดพูล
    const addColors = Math.floor((state.ws.level - 1) / 2);
    const colors = Math.min(cfgBase.colors + addColors, COLOR_POOL.length);
    const empties = cfgBase.empties;

    // ตัวสร้างด่านแบบกันค้าง
    state.ws.tubes = makePuzzleWithGuard(colors, empties, tubeCapacity, state.ws.level);
    renderBoard();
    startTimer(); // จับเวลาทันทีเมื่อเริ่มด่าน
  }

  function renderBoard() {
    elBoard.innerHTML = "";
    const tubes = state.ws.tubes;

    tubes.forEach((stack, i) => {
      const tube = document.createElement("div");
      tube.className = "ws-tube";
      tube.style.cssText = `
        width:56px; height:${tubeCapacity * 34 + 16}px; 
        border:2px solid #e5e7eb; border-radius:12px; 
        display:flex; flex-direction:column-reverse; 
        padding:8px; gap:6px; background:#fff; cursor:pointer;
      `;
      tube.setAttribute("role", "button");
      tube.setAttribute("aria-label", `หลอดที่ ${i + 1}`);

      // ไฮไลต์ถ้าเลือก
      if (selectedIdx === i) {
        tube.style.boxShadow = "0 0 0 3px rgba(37,99,235,.25)";
        tube.style.borderColor = "#2563eb";
      }

      for (let k = 0; k < tubeCapacity; k++) {
        const slot = document.createElement("div");
        slot.style.cssText = `
          height:28px; border-radius:8px; 
          background:${stack[k] || "transparent"};
          border:${stack[k] ? "0" : "1px dashed #e5e7eb"};
        `;
        tube.appendChild(slot);
      }

      tube.onclick = () => {
        // ยังไม่เลือก -> เลือกหลอดต้นทาง
        if (selectedIdx === null) {
          selectedIdx = i;
          renderBoard();
          return;
        }
        // คลิกซ้ำหลอดเดิม -> ยกเลิก
        if (selectedIdx === i) {
          selectedIdx = null;
          renderBoard();
          return;
        }

        // พยายามเทจาก selectedIdx -> i
        const moved = tryPour(tubes, selectedIdx, i);
        if (moved) {
          state.ws.moves++;
          elMoves.textContent = state.ws.moves.toString();
          if (!state.ws.startTs) startTimer(); // เผื่อกรณีเริ่มหลังสร้าง
          selectedIdx = null; // เทสำเร็จ เคลียร์การเลือก
          renderBoard();

          if (isSolved(tubes)) {
            stopTimer();
            const timeMs = state.ws.elapsedMs;
            const score = scoreWaterSort(timeMs, state.ws.moves, state.ws.diff, state.ws.level);
            state.gameWaterFinished = true;
            manageNextButtonInStep7();
            ensureUid().then(({ uid }) =>
              fire("saveGame", {
                uid, game: "watersort",
                score, timeMs, moves: state.ws.moves,
                diff: state.ws.diff, level: state.ws.level
              })
            );
            showWinPopup(timeMs, score, () => {
              btnNext.disabled = false;
            });
          }
        } else {
          // เทไม่ได้ -> เปลี่ยนมาเลือกหลอดนี้แทน
          selectedIdx = i;
          renderBoard();
        }
      };

      elBoard.appendChild(tube);
    });
  }

  // คะแนน (ไว + ขยับน้อย + เลเวล/ความยากสูง = คะแนนมาก)
  function scoreWaterSort(ms, moves, diff, level) {
    const base = 100000;
    const penalty = Math.floor(ms / 10) + moves * 250;
    const diffMul = diff === "insane" ? 2.0 : diff === "medium" ? 1.5 : 1.0;
    const lvlMul = 1 + Math.min(level - 1, 10) * 0.08;
    return Math.max(0, Math.floor((base - penalty) * diffMul * lvlMul));
  }

  function showWinPopup(timeMs, score, onClose) {
    const m = document.getElementById("ggModal");
    if (!m) return;
    m.querySelector(".modal-emoji").textContent = "🎉";
    m.querySelector(".modal-title").textContent = "เยี่ยมมาก!";
    m.querySelector(".modal-desc").innerHTML =
      `คุณผ่านด่านแล้ว<br>เวลา: <strong>${fmtMs(timeMs)}</strong> • คะแนน: <strong>${score.toLocaleString()}</strong>`;
    m.classList.remove("hide");

    const closeBtn = document.getElementById("closeModal");
    const handler = () => {
      m.classList.add("hide");
      closeBtn?.removeEventListener("click", handler);
      if (typeof onClose === "function") onClose();
      // คืนคำเดิมบน modal
      closeAlertModalReset();
    };
    closeBtn?.addEventListener("click", handler, { once: true });
    m.addEventListener(
      "click",
      (e) => {
        if (e.target === m) handler();
      },
      { once: true }
    );
  }

  function advanceLevel() {
    state.ws.level += 1;
    elLevel.textContent = state.ws.level.toString();
    state.gameWaterFinished = false; // ต้องผ่านใหม่ในด่านถัดไป
  }

  // ===== Timer =====
  function startTimer() {
    resetTimer();
    state.ws.startTs = performance.now();
    state.ws.timerId = setInterval(() => {
      state.ws.elapsedMs = performance.now() - state.ws.startTs;
      elTime.textContent = fmtMs(state.ws.elapsedMs);
    }, 100);
  }
  function stopTimer() {
    if (state.ws.timerId) clearInterval(state.ws.timerId);
    state.ws.timerId = null;
    if (state.ws.startTs) {
      state.ws.elapsedMs = performance.now() - state.ws.startTs;
      elTime.textContent = fmtMs(state.ws.elapsedMs);
    }
  }
  function resetTimer() {
    if (state.ws.timerId) clearInterval(state.ws.timerId);
    state.ws.timerId = null;
    state.ws.startTs = null;
    state.ws.elapsedMs = 0;
    elTime.textContent = fmtMs(0);
  }

  function fmtMs(ms) {
    const t = Math.floor(ms);
    const m = Math.floor(t / 60000);
    const s = Math.floor((t % 60000) / 1000);
    const ds = Math.floor((t % 1000) / 100);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ds}`;
  }
}

// ====== ลอจิกเกม Water Sort (กติกา/เท/เช็คชนะ/สร้างด่าน) ======

// เทจาก i -> j ตามกติกา (คืน true ถ้าเทได้)
function tryPour(tubes, i, j) {
  if (i === j) return false;
  const from = tubes[i];
  const to = tubes[j];
  if (!from || !to) return false;
  if (from.length === 0) return false;
  if (to.length >= tubeCapacity) return false;

  const color = from[from.length - 1];

  if (to.length === 0) {
    let moved = 0;
    while (
      from.length > 0 &&
      from[from.length - 1] === color &&
      to.length < tubeCapacity
    ) {
      to.push(from.pop());
      moved++;
    }
    return moved > 0;
  }

  const topTo = to[to.length - 1];
  if (topTo !== color) return false;

  let moved = 0;
  while (
    from.length > 0 &&
    from[from.length - 1] === color &&
    to.length < tubeCapacity
  ) {
    to.push(from.pop());
    moved++;
  }
  return moved > 0;
}

// ชนะ: ทุกหลอดว่าง หรือเต็ม 4 และสีเดียวกันทั้งหมด
function isSolved(tubes) {
  return tubes.every(
    (t) => t.length === 0 || (t.length === tubeCapacity && new Set(t).size === 1)
  );
}

// สุ่มสร้างกระดาน “กันค้าง” และไม่น่าเบื่อ
function makePuzzleWithGuard(numColors, empties, cap, level) {
  const colors = COLOR_POOL.slice(0, numColors);
  const tubeCount = numColors + empties;
  const capacity = cap;
  const maxTry = 300;

  const notSolved = (tubes) =>
    !tubes.every(
      (t) => t.length === 0 || (t.length === capacity && new Set(t).size === 1)
    );

  const hasAnyMove = (tubes) => {
    const N = tubes.length;
    for (let i = 0; i < N; i++) {
      if (tubes[i].length === 0) continue;
      const topI = tubes[i][tubes[i].length - 1];
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        if (tubes[j].length >= capacity) continue;
        if (tubes[j].length === 0) return true;
        const topJ = tubes[j][tubes[j].length - 1];
        if (topI === topJ) return true;
      }
    }
    return false;
  };

  for (let attempt = 0; attempt < maxTry; attempt++) {
    const tubes = Array.from({ length: tubeCount }, () => []);
    const pool = colors.flatMap((c) => [c, c, c, c]);

    shuffleInPlace(pool);

    // เติมลงเฉพาะ “หลอดสี” ก่อน (0..numColors-1) เพื่อให้หลอดว่างยังว่างจริง
    const fillTargets = Array.from({ length: numColors }, (_, i) => i);
    if (level > 1) shuffleInPlace(fillTargets);

    let cursor = 0;
    while (cursor < pool.length) {
      let placed = false;
      for (let idx = 0; idx < fillTargets.length && cursor < pool.length; idx++) {
        const t = fillTargets[idx];
        if (tubes[t].length < capacity) {
          tubes[t].push(pool[cursor++]);
          placed = true;
        }
      }
      if (!placed) break;
      if (Math.random() < 0.3) shuffleInPlace(fillTargets);
    }

    // ย้าย “หลอดว่าง” ไว้ท้ายอาร์เรย์
    for (let i = 0; i < empties; i++) tubes.push([]);

    if (notSolved(tubes) && hasAnyMove(tubes)) {
      return tubes;
    }
  }

  // ฟอลแบ็กกันค้าง: เริ่มใกล้จบแล้วสลับยอด 2 หลอด
  const fallback = COLOR_POOL.slice(0, numColors).map((c) => [c, c, c, c]);
  for (let i = 0; i < empties; i++) fallback.push([]);
  if (fallback.length >= 3) {
    const a = 0, b = 1;
    const tmp1 = fallback[a].pop(), tmp2 = fallback[b].pop();
    if (tmp1) fallback[b].push(tmp1);
    if (tmp2) fallback[a].push(tmp2);
  }
  return fallback;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
