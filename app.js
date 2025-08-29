// ============ CONFIG ============
const GOOGLE_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfLXI7a3w8HBYE8C3WWrARwLc-2Xxf-F3sJBW2gGLWQ2RbNhA/viewform?embedded=true";
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwU_Euf0ztbHNBg1OXClFUJvx_vYNG0h_E2qf5_c-ASLvPRRKbDGkmaZ1_6p3SHE4Al/exec";

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
  gameTab: null,
  gameFocusFinished: false,
  gameMemoryFinished: false,
  get gameFinished(){ return this.gameFocusFinished || this.gameMemoryFinished; }
};

const stepsTotal = 10;
const bar = document.getElementById("bar");
const toastEl = document.getElementById("toast");

// ======== PERF: in-flight promise ป้องกันยิงซ้ำ + วอร์มอัปตั้งแต่หน้าโหลด ========
let inflightInit = null;
let uidReady = false;

// ping แบบไม่บล็อก UI (ลดแลคครั้งแรก)
(function prewarm(){
  // no-cors ping จะไม่รอผล แต่ช่วยบูท cold start
  try { fetch(WEB_APP_URL + "?ping=1", { mode:"no-cors", keepalive:true }); } catch(e){}
  // เริ่ม init ทันที แต่ไม่บล็อกการกดปุ่ม
  ensureUid().catch(()=>{ /* เงียบ */ });
})();

// ============ HELPERS ============
let toastTimer = null;
function showToast(msg="", ms=2000){
  if(!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove("hide");
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{
    toastEl.classList.remove("show");
    toastEl.classList.add("hide");
  }, ms);
}

function setStep(n){
  if(n === state.step) return;
  state.step = n;
  document.querySelectorAll(".stage").forEach(el=>{
    el.classList.toggle("hide", +el.dataset.step !== n);
  });
  bar.style.width = ((n-1)/(stepsTotal-1))*100 + "%";
  onStepEnter(n);
  window.scrollTo({ top:0, behavior:"smooth" });
}

// fetch helper: เร็วขึ้น (timeout สั้น + retry น้อย) และไม่บล็อก UI
async function fire(action, payload={}, { retry=0, timeoutMs=6000 } = {}){
  const ctrl = new AbortController();
  const to = setTimeout(()=>ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action, ...payload }),
      signal: ctrl.signal
    });
    clearTimeout(to);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }catch(e){
    clearTimeout(to);
    if(retry>0){
      await new Promise(r=>setTimeout(r, 350));
      return fire(action, payload, { retry: retry-1, timeoutMs });
    }
    console.warn("fire failed:", action, e);
    return null;
  }
}

// ✅ ensureUid: คิวเดียว, ทำงานเบื้องหลัง, เก็บลง localStorage
async function ensureUid(){
  if(uidReady && state.uid && state.user_id) return { uid: state.uid, user_id: state.user_id };

  if(inflightInit) return inflightInit;

  inflightInit = (async ()=>{
    // ถ้ามี uid เดิม ลอง validate แบบไม่บล็อก
    if(state.uid && state.user_id && !state.completed){
      const resp = await fire("init", { uid: state.uid }, { retry: 0, timeoutMs: 4500 });
      if(resp && resp.ok){
        state.completed = !!resp.completed;
        localStorage.setItem("spst_completed", state.completed.toString());
        uidReady = true;
        return { uid: state.uid, user_id: state.user_id };
      }
    }
    // ไม่มี/ใช้ไม่ได้ -> ขอใหม่
    const resp2 = await fire("init", { uid: state.uid || null }, { retry: 1, timeoutMs: 6000 });
    if(resp2 && resp2.ok){
      state.uid = resp2.uid;
      state.user_id = resp2.user_id;
      state.completed = !!resp2.completed;
      localStorage.setItem("spst_uid", state.uid);
      localStorage.setItem("spst_user_id", state.user_id);
      localStorage.setItem("spst_completed", state.completed.toString());
      uidReady = true;
      return { uid: state.uid, user_id: state.user_id };
    }
    // ล้มเหลว: ให้ UI เดินต่อได้ แต่จะลองอีกทีตอนต้องบันทึกจริง
    uidReady = false;
    throw new Error("init failed");
  })();

  try{
    const r = await inflightInit;
    return r;
  }finally{
    inflightInit = null;
  }
}

// ============ STEP HOOK ============
function onStepEnter(n){
  if(n===6){
    if(state.choice) highlightSelectedChip(state.choice);
    document.getElementById("goChoice").disabled = !state.choice;
  }
  if(n===7){
    renderMethod();
    manageNextButtonInStep7();
  }
  if(n===9){
    const f = document.getElementById("gform");
    if(f && !f.src) f.src = GOOGLE_FORM_URL;
    const chk = document.getElementById("formDoneChk");
    const btn = document.getElementById("formNextBtn");
    chk.checked = false;
    btn.disabled = true;
  }
  if(n===10){
    const summaryOut = document.getElementById("summaryOut");
    const completedMsg = document.getElementById("completedMsg");
    const answered = Object.keys(state.answers).length;
    summaryOut.innerHTML = `
      <div><strong>สรุปผลของคุณ</strong></div>
      <div>ยินยอมทำแบบประเมิน: <strong>${state.consent ? "ยินยอม" : "ไม่ยินยอม"}</strong></div>
      ${
        state.consent
        ? `<div>คะแนน SPST-20: <strong>${state.score}</strong> | <span>${state.interp}</span></div>
           <div style="margin-top:8px" class="muted">${state.detail}</div>
           <div>ตอบจริง: ${answered} / 20 ข้อ</div>`
        : `<div class="muted">คุณเลือกไม่ทำแบบประเมิน ระบบได้พาไปส่วนวิธีจัดการแทน</div>`
      }
    `;
    if(completedMsg) completedMsg.style.display = state.completed ? "block" : "none";
  }
}

// ============ NAV ============
document.getElementById("startBtn").addEventListener("click", () => {
  // ✅ เด้งไปขั้น 2 ทันที ไม่รอเครือข่าย
  setStep(2);
  // ทำ init เบื้องหลัง (ถ้ายังไม่พร้อม)
  ensureUid().catch(()=> showToast("โหมดออฟไลน์ชั่วคราว — จะซิงค์ให้อัตโนมัติเมื่อเน็ตกลับมา"));
});

document.querySelectorAll("[data-nav]").forEach((btn)=>{
  btn.addEventListener("click",(e)=>{
    const dir = e.currentTarget.dataset.nav;
    if(dir==="back") setStep(Math.max(1, state.step-1));
    if(dir==="next") setStep(Math.min(stepsTotal, state.step+1));
  });
});

// consent
document.getElementById("consentYes").addEventListener("click", async ()=>{
  if(state.completed){ showToast("คุณทำแบบประเมินครบแล้ว"); setStep(10); return; }
  state.consent = true;
  setStep(3);
  try{
    const { uid } = await ensureUid();
    fire("saveConsent", { uid, consent:true });
  }catch(_){ /* เงียบไว้ โหมดออฟไลน์ชั่วคราว */ }
});

document.getElementById("consentNo").addEventListener("click", async ()=>{
  if(state.completed){ showToast("คุณทำแบบประเมินครบแล้ว"); setStep(10); return; }
  state.consent = false;
  setStep(5);
  try{
    const { uid } = await ensureUid();
    fire("saveConsent", { uid, consent:false });
  }catch(_){}
});

// jumpers
document.querySelector('[data-go="questions"]').addEventListener("click", ()=> setStep(4));
document.querySelector('[data-go="manage"]').addEventListener("click", ()=> setStep(6));
document.querySelector('[data-go="form"]').addEventListener("click", ()=>{
  const f = document.getElementById("gform");
  if(f) f.src = GOOGLE_FORM_URL;
  setStep(9);
});

// ============ QUESTIONS ============
const items = [
  "กลัวทำงานผิดพลาด","ไปไม่ถึงเป้าหมายที่วางไว้","ครอบครัวมีความขัดแย้งกันในเรื่องเงินหรือเรื่องงานในบ้าน",
  "กังวลเรื่องมลภาวะ/สารพิษ (อากาศ น้ำ เสียง ดิน)","รู้สึกว่าต้องแข่งขันหรือเปรียบเทียบ","เงินไม่พอใช้จ่าย",
  "กล้ามเนื้อตึงหรือปวด","ปวดหัวจากความตึงเครียด","ปวดหลัง","ความอยากอาหารเปลี่ยนแปลง",
  "ปวดศีรษะข้างเดียว","รู้สึกวิตกกังวล","รู้สึกคับข้องใจ","รู้สึกโกรธ หรือหงุดหงิด","รู้สึกเศร้า",
  "ความจำไม่ดี","รู้สึกสับสน","ตั้งสมาธิลำบาก","รู้สึกเหนื่อยง่าย","เป็นหวัดบ่อย ๆ",
];
const questionsDiv = document.getElementById("questions");
items.forEach((t,i)=>{
  const idx = i+1;
  const q = document.createElement("div");
  q.className = "q"; q.id = `qbox-${idx}`;
  q.innerHTML = `
    <h4>${idx}. ${t}</h4>
    <div class="scale" role="radiogroup" aria-label="ระดับความเครียด ข้อที่ ${idx}">
      ${["1. ไม่รู้สึกเครียด","2. เครียดเล็กน้อย","3. เครียดปานกลาง","4. เครียดมาก","5. เครียดมากที่สุด"].map((lab,valIdx)=>`
        <label><input type="radio" name="q${idx}" value="${valIdx+1}" /><span>${lab}</span></label>
      `).join("")}
    </div>
  `;
  questionsDiv.appendChild(q);
  q.addEventListener("change",(e)=>{
    if(e.target.name===`q${idx}`) state.answers[idx] = +e.target.value;
  });
});

const levelDetails = {
  low:`ท่านมีความเครียดอยู่ในระดับน้อยและหายไปได้ในระยะเวลาสั้น ๆ เป็นความเครียดที่เกิดขึ้นได้ในชีวิตประจำวันและสามารถปรับตัวกับสถานการณ์ต่าง ๆ ได้อย่างเหมาะสม ความเครียดในระดับนี้ถือว่ามีประโยชน์ในการดำเนินชีวิตประจำวัน เป็นแรงจูงใจในที่นำไปสู่ความสำเร็จในชีวิตได้`,
  moderate:`ท่านมีความเครียดในระดับปานกลางเกิดขึ้นได้ในชีวิตประจำวันเนื่องจากมีสิ่งคุกคามหรือ เหตุการณ์ที่ทำให้เครียด อาจรู้สึกวิตกกังวลหรือกลัว ถือว่าอยู่ในเกณฑ์ปกติ ความเครียดระดับนี้ไม่ก่อให้เกิดอันตรายหรือเป็นผลเสีย ต่อการดำเนินชีวิต ท่านสามารถผ่อนคลายความเครียดด้วยการทำกิจกรรมที่เพิ่มพลัง เช่น ออกกำลังกาย เล่นกีฬาทำสิ่งที่สนุกสนานเพลิดเพลิน เช่น ฟังเพลง อ่านหนังสือ ทำงานอดิเรก หรือพูดคุยระบายความไม่สบายใจ กับผู้ที่ไว้วางใจ`,
  high:`ท่านมีความเครียดในระดับสูง เป็นระดับที่ท่านได้รับความเดือนร้อนจากสิ่งต่าง ๆ หรือเหตุการณ์ รอบตัวทำให้วิตกกังวล กลัว รู้สึกขัดแย้งหรืออยู่ในสถานการณ์ที่แก้ไข จัดการปัญหานั้นไม่ได้ ปรับความรู้สึกด้วยความลำบากจะส่งผลต่อการใช้ชีวิตประจำวัน และการเจ็บป่วย เช่น ความดันโลหิตสูง เป็นแผลในกระเพาะอาหาร ฯลฯ
สิ่งที่ท่านต้องรีบทำเมื่อมีความเครียดในระดับนี้คือ คลายเครียดด้วยวิธีที่ทำได้ง่ายแต่ได้ผลดีคือ การฝึกหายใจ คลายเครียด พูดคุยระบายความเครียดกับผู้ไว้วางใจ หาสาเหตุหรือปัญหาที่ทำให้เครียดและหาวิธีแก้ไขหากท่านไม่สามารถจัดการคลายเครียดด้วยตนเองได้ ควรปรึกษากับผู้ให้การปรึกษาในหน่วยงานต่าง ๆ`,
  severe:`ท่านมีความเครียดในระดับรุนแรง เป็นความเครียดระดับสูงที่เกิดต่อเนื่องหรือท่านกำลังเผชิญกับวิกฤตของ ชีวิต เช่น เจ็บป่วยรุนแรง เรื้อรังมีความพิการ สูญเสียคนรัก ทรัพย์สินหรือสิ่งที่รัก ความเครียดระดับนี้ส่งผลทำให้เจ็บป่วยทางกายและสุขภาพจิต ชีวิตไม่มีความสุข ความคิดฟุ้งช่าน การตัดสินใจไม่ดี ยับยั้งอารมณ์ไม่ได้
ความเครียดระดับนี้ถ้าปล่อยไว้จะเกิดผลเสียทั้งต่อตนเองและคนใกล้ชิด ควรได้รับการช่วยเหลือจาก
ผู้ให้การปรึกษาอย่างรวดเร็ว เช่น ทางโทรศัพท์ หรือผู้ให้การปรึกษาในหน่วยงานต่าง ๆ`
};

const scoreBox = document.getElementById("scoreBox");

function openAlertModal(title="โปรดตรวจสอบ", msg=""){
  const m = document.getElementById("ggModal");
  m.querySelector(".modal-emoji").textContent = "⚠️";
  m.querySelector(".modal-title").textContent = title;
  m.querySelector(".modal-desc").textContent = msg;
  m.classList.remove("hide");
}
function closeAlertModalReset(){
  const m = document.getElementById("ggModal");
  m.querySelector(".modal-emoji").textContent = "🎉";
  m.querySelector(".modal-title").textContent = "เยี่ยมมาก!";
  m.querySelector(".modal-desc").textContent = "คุณเล่นเกมจบแล้ว สามารถไปขั้นถัดไปได้";
}

document.getElementById("calcBtn").addEventListener("click", async ()=>{
  if(state.completed){ showToast("คุณทำแบบประเมินครบแล้ว"); setStep(10); return; }
  const missing = [];
  for(let i=1;i<=20;i++) if(!state.answers[i]) missing.push(i);
  if(missing.length){
    const first = missing[0];
    const target = document.getElementById(`qbox-${first}`);
    if(target) target.scrollIntoView({ behavior:"smooth", block:"center" });
    openAlertModal("ยังตอบไม่ครบ", `คุณยังไม่ได้ตอบข้อ: ${missing.join(", ")}\nกรุณาตอบให้ครบทั้ง 20 ข้อ`);
    document.getElementById("closeModal").onclick = ()=>{
      document.getElementById("ggModal").classList.add("hide");
      closeAlertModalReset();
    };
    return;
  }
  let sum = 0; Object.values(state.answers).forEach(v=>sum+=v);
  state.score = sum;
  let interp="", tag="", detail="";
  if(sum<=23){ interp="ระดับน้อย"; tag="ok"; detail=levelDetails.low; }
  else if(sum<=41){ interp="ระดับปานกลาง"; tag="warn"; detail=levelDetails.moderate; }
  else if(sum<=61){ interp="ระดับสูง"; tag="bad"; detail=levelDetails.high; }
  else { interp="ระดับรุนแรง"; tag="bad"; detail=levelDetails.severe; }
  state.interp = interp; state.detail = detail;

  const severeHelp = sum>=62 ? `
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
    </div>` : "";

  scoreBox.classList.remove("hide");
  scoreBox.innerHTML = `
    <div><strong>คะแนนรวม:</strong> ${sum} คะแนน</div>
    <div>การแปลผล: <strong class="tag-${tag}">${interp}</strong></div>
    <div class="muted" style="margin-top:6px;white-space:pre-line">${detail}</div>
    ${severeHelp}
    <div class="btns" style="margin-top:10px"><button class="primary" id="toPart2">ไปส่วนที่ 2</button></div>
  `;
  document.getElementById("toPart2").addEventListener("click", ()=> setStep(5));

  // บันทึกเบื้องหลัง ไม่บล็อก UI
  ensureUid().then(({uid})=>{
    fire("saveAssessment", { uid, score: state.score, level: state.interp, answers: state.answers });
  }).catch(()=>{ /* ออฟไลน์: ข้ามการบันทึกชั่วคราว */ });
});

// ============ PART 2 (choices) ============
const choiceContainer = document.getElementById("choiceChips");
const goChoiceBtn = document.getElementById("goChoice");
choiceContainer.querySelectorAll(".chip").forEach(ch=>{
  ch.addEventListener("click", ()=>{
    if(state.completed){ showToast("คุณทำแบบประเมินครบแล้ว"); setStep(10); return; }
    const choice = ch.dataset.choice;
    state.choice = choice;
    highlightSelectedChip(choice);
    goChoiceBtn.disabled = false;
    ensureUid().then(({uid})=> fire("saveChoice",{ uid, choice })).catch(()=>{});
  });
});
goChoiceBtn.addEventListener("click", ()=>{
  if(!state.choice){ showToast("⚠️ กรุณาเลือกแนวทางคลายเครียดก่อน"); return; }
  if(state.completed){ showToast("คุณทำแบบประเมินครบแล้ว"); setStep(10); return; }
  setStep(7);
});
function highlightSelectedChip(choice){
  choiceContainer.querySelectorAll(".chip").forEach(el=> el.classList.toggle("selected", el.dataset.choice===choice));
}

// ============ METHOD RENDER ============
const methodPane = document.getElementById("methodPane");
const gameTabs = document.getElementById("gameTabs");
const memoryPane = document.getElementById("memoryPane");
const focusPane = document.getElementById("focusPane");
const nextFrom7 = document.getElementById("nextFrom7");
const gameWarn = document.getElementById("gameWarn");

function clearGamePanes(){
  memoryPane.classList.add("hide");
  focusPane.classList.add("hide");
  focusPane.innerHTML = "";
  const grid = document.getElementById("matchGrid");
  if(grid) grid.innerHTML = "";
}
function renderMethod(){
  const c = state.choice;
  methodPane.innerHTML = "";
  clearGamePanes();
  if(!c){ methodPane.innerHTML = "<p class='muted'>ยังไม่ได้เลือกวิธี</p>"; return; }

  // 🎵 ฟังเพลงผ่อนคลาย + เครดิตช่อง
  if(c==="music"){
    gameTabs.classList.add("hide");
    methodPane.innerHTML += `
      <h3>ฟังเพลงผ่อนคลาย</h3>
      <p class="muted">ตัวอย่างจาก YouTube</p>

      <!-- เพลงที่ 1 -->
      <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:4px">
        <iframe src="https://www.youtube.com/embed/dhFt7eURm78?rel=0" title="เพลงผ่อนคลาย 1" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen
          style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
      </div>
      <div class="small muted" style="margin-bottom:12px">
        เครดิต: <a href="https://www.youtube.com/channel/UCqYyUNmDjATVjb56regwDqw" target="_blank" rel="noopener noreferrer">เสถียรธรรมสถาน SDS Channel</a>
      </div>

      <!-- เพลงที่ 2 -->
      <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:4px">
        <iframe src="https://www.youtube.com/embed/HAzZH6wccew?rel=0" title="เพลงผ่อนคลาย 2" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen
          style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
      </div>
      <div class="small muted" style="margin-bottom:12px">
        เครดิต: <a href="https://www.youtube.com/channel/UCayNbjHNdphueeBy0tPNIig" target="_blank" rel="noopener noreferrer">Healing water sound ch</a>
      </div>

      <!-- เพลงที่ 3 -->
      <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;margin-bottom:4px">
        <iframe src="https://www.youtube.com/embed/hlWiI4xVXKY?rel=0" title="เพลงผ่อนคลาย 3" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen
          style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
      </div>
      <div class="small muted" style="margin-bottom:12px">
        เครดิต: <a href="https://www.youtube.com/channel/UCjzHeG1KWoonmf9d5KBvSiw" target="_blank" rel="noopener noreferrer">Soothing Relaxation</a>
      </div>

      <div class="result" style="margin-top:12px">
        เคล็ดลับ: เลือกเพลงจังหวะช้า-กลาง ไม่มีเนื้อร้องเยอะ ช่วยให้ลมหายใจช้าลง
      </div>`;
    return;
  }

  // 🌿 ฝึกหายใจ
  if(c==="breath"){
    gameTabs.classList.add("hide");
    methodPane.innerHTML += `
      <h3>ฝึกหายใจแบบ 4–4–6</h3>
      <div class="circle-breathe" id="breathCircle"><div class="label-center" id="breathLabel">พร้อม…</div></div>
      <div class="label-center">รอบละ ~14 วินาที • ลองอย่างน้อย 6–10 รอบ</div>
      <div class="btns" style="justify-content:center">
        <button class="ghost" id="breathStart">เริ่มฝึก</button>
        <button class="subtle" id="breathStop">หยุด</button>
      </div>`;
    setupBreathing(); return;
  }

  // 🎥 วิดีโอผ่อนคลาย + เครดิตช่อง
  if(c==="video"){
    gameTabs.classList.add("hide");
    methodPane.innerHTML += `
      <h3>วิดีโอผ่อนคลาย</h3>
      <div style="position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
        <iframe title="relax-video" src="https://www.youtube.com/embed/2OEL4P1Rz04?rel=0" loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen
          style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
      </div>
      <div class="small muted" style="margin-top:8px">
        เครดิต: <a href="https://www.youtube.com/channel/UCjzHeG1KWoonmf9d5KBvSiw" target="_blank" rel="noopener noreferrer">LIVE Soothing Relaxation</a>
      </div>`;
    return;
  }

  // 🎮 เกม
  if(c==="game"){
    gameTabs.classList.remove("hide");
    methodPane.innerHTML = `<div class="result">เลือกเกมที่ต้องการเล่นจากแท็บด้านบน</div>`;
    return;
  }
}
function manageNextButtonInStep7(){
  if(state.choice==="game"){
    if(state.gameFinished){ nextFrom7.disabled=false; gameWarn.classList.add("hide"); }
    else { nextFrom7.disabled=true; gameWarn.classList.remove("hide"); }
  }else{
    nextFrom7.disabled=false; gameWarn.classList.add("hide");
  }
}
function setupGameTabs(){
  const btnFocus = document.querySelector('[data-game-tab="focus"]');
  const btnMemory = document.querySelector('[data-game-tab="memory"]');
  btnFocus.onclick = ()=>{ state.gameTab="focus"; showFocusGameOnly(); };
  btnMemory.onclick = ()=>{ state.gameTab="memory"; showMemoryGameOnly(); };
}
function showFocusGameOnly(){
  methodPane.innerHTML = ""; memoryPane.classList.add("hide"); focusPane.classList.remove("hide");
  renderFocusGame(); manageNextButtonInStep7();
}
function showMemoryGameOnly(){
  methodPane.innerHTML = ""; focusPane.classList.add("hide"); memoryPane.classList.remove("hide");
  renderMemoryGame(); manageNextButtonInStep7();
}

// ============ Focus Game ============
function renderFocusGame(){
  focusPane.innerHTML = `
    <h3>เกมโฟกัสสายตา</h3>
    <p class="muted">คลิกที่วงกลมเท่าที่หาได้ใน 20 วินาที</p>
    <div id="gameArea" style="position:relative;height:260px;border:1px solid #e5e7eb;border-radius:12px;margin-top:8px;background:#fff"></div>
    <div class="btns"><button class="ghost" id="gameStart">เริ่มเกม</button><span id="gameInfo" class="muted"></span></div>
  `;
  setupGame();
}
function setupGame(){
  const area = document.getElementById("gameArea");
  const info = document.getElementById("gameInfo");
  area.innerHTML = "";
  let score=0, time=20, running=false, tInt=null, sInt=null;
  function spawn(){
    if(!running) return;
    const dot = document.createElement("div");
    const s = 24;
    const x = Math.random()*(area.clientWidth - s);
    const y = Math.random()*(area.clientHeight - s);
    dot.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:999px;background:#2563eb;cursor:pointer`;
    dot.addEventListener("click",()=>{ score++; dot.remove(); });
    area.appendChild(dot);
    setTimeout(()=>dot.remove(), 1400);
  }
  function stop(){
    running=false; clearInterval(tInt); clearInterval(sInt);
    info.textContent = `จบเกม • ได้ ${score} วง`;
    state.gameFocusFinished = true; openCongratsModal(); manageNextButtonInStep7();
    ensureUid().then(({uid})=> fire("saveGame",{ uid, game:"focus", score })).catch(()=>{});
  }
  document.getElementById("gameStart").onclick = ()=>{
    score=0; time=20; area.innerHTML=""; running=true;
    info.textContent = `เวลา ${time}s | คะแนน 0`;
    clearInterval(tInt); clearInterval(sInt);
    tInt = setInterval(()=>{ time--; info.textContent = `เวลา ${time}s | คะแนน ${score}`; if(time<=0) stop(); }, 1000);
    sInt = setInterval(spawn, 450);
  };
}

// ============ Memory Game ============
function renderMemoryGame(){ initMemoryGame(); }
function initMemoryGame(){
  const icons = ["🍎","🍌","🍇","🍒","🥝","🍍","🍉","🍑"];
  let cards = [...icons, ...icons].sort(()=>0.5 - Math.random());
  const grid = document.getElementById("matchGrid");
  grid.innerHTML = "";
  let flipped = []; let locked=false; let matched=0;
  cards.forEach(icon=>{
    const card = document.createElement("div");
    card.classList.add("card"); card.dataset.icon = icon;
    card.addEventListener("click", flip);
    grid.appendChild(card);
  });
  function flip(){
    if(locked) return;
    if(this.classList.contains("matched") || this.classList.contains("flipped")) return;
    if(flipped.length>=2) return;
    this.classList.add("flipped"); this.textContent = this.dataset.icon; flipped.push(this);
    if(flipped.length===2){ locked=true; setTimeout(check, 800); }
  }
  function check(){
    const [a,b] = flipped;
    if(a && b && a.dataset.icon===b.dataset.icon){
      a.classList.add("matched"); b.classList.add("matched"); matched+=2;
      if(matched===cards.length){
        state.gameMemoryFinished = true; openCongratsModal(); manageNextButtonInStep7();
        ensureUid().then(({uid})=> fire("saveGame",{ uid, game:"memory", score: matched/2 })).catch(()=>{});
      }
    }else{
      if(a){ a.classList.remove("flipped"); a.textContent=""; }
      if(b){ b.classList.remove("flipped"); b.textContent=""; }
    }
    flipped=[]; locked=false;
  }
  const resetBtn = document.getElementById("resetMemory");
  if(resetBtn) resetBtn.onclick = ()=> initMemoryGame();
}

// ============ Breathing ============
function setupBreathing(){
  const circle = document.getElementById("breathCircle");
  const label = document.getElementById("breathLabel");
  let timer=null, phase=0;
  const seq = [
    { text:"หายใจเข้า… 4 วินาที", scale:1.15, dur:4000 },
    { text:"กลั้นไว้… 4 วินาที", scale:1.15, dur:4000 },
    { text:"ผ่อนลมหายใจออก… 6 วินาที", scale:1.0, dur:6000 },
  ];
  const tick = ()=>{
    const p = seq[phase % seq.length];
    circle.style.transform = `scale(${p.scale})`;
    label.textContent = p.text;
    timer = setTimeout(()=>{ phase++; tick(); }, p.dur);
  };
  document.getElementById("breathStart").onclick = ()=>{
    if(timer) clearTimeout(timer); phase=0; tick();
  };
  document.getElementById("breathStop").onclick = ()=>{
    if(timer) clearTimeout(timer); label.textContent="พักหายใจตามสบาย"; circle.style.transform="scale(1)";
  };
}

// ============ Congrats / Alert Modal ============
const ggModal = document.getElementById("ggModal");
const closeModalBtn = document.getElementById("closeModal");
function openCongratsModal(){ ggModal.classList.remove("hide"); }
function closeCongratsModal(){ ggModal.classList.add("hide"); }
closeModalBtn.addEventListener("click", ()=>{ closeCongratsModal(); closeAlertModalReset(); });
ggModal.addEventListener("click", (e)=>{ if(e.target===ggModal){ closeCongratsModal(); closeAlertModalReset(); }});

// ============ Google Form Confirm ============
const formDoneChk = document.getElementById("formDoneChk");
const formNextBtn = document.getElementById("formNextBtn");
formDoneChk.addEventListener("change", ()=>{
  formNextBtn.disabled = !formDoneChk.checked;
  if(formDoneChk.checked){
    showToast("✅ ยืนยันการส่งแบบฟอร์มแล้ว");
    ensureUid().then(({uid})=> fire("saveFormDone",{ uid, done:true })).catch(()=>{});
  }else{
    ensureUid().then(({uid})=> fire("saveFormDone",{ uid, done:false })).catch(()=>{});
  }
});

// ============ Restart ============
document.getElementById("restart").addEventListener("click", ()=>{
  localStorage.removeItem("spst_uid");
  localStorage.removeItem("spst_user_id");
  localStorage.removeItem("spst_completed");
  location.reload();
});

// ============ Init ============
setupGameTabs();

