import { firstName, hasAccess, progress } from "./model.js";
import { nextMastery, recommendNext } from "./masteryEngine.js";
import { foldQuizIntoMastery, quizAction, scoreQuiz } from "./quizEngine.js";
import {
  accountView,
  coursesView,
  helperView,
  homeView,
  lessonView,
  noticeView,
  paywallView,
  practiceView,
  quizResultView,
  quizView,
  show
} from "./views.js";

const URL = "https://nhmzuqhjhkdklezimmll.supabase.co";
const KEY = "sb_publishable_8Mna1mVDvCrbwsJkSvofWg_pY8pelK7";
const FUNCTIONS = `${URL}/functions/v1`;
const SESSION_KEY = "computador-facil-session";
const BASE = location.origin + location.pathname;

function savedSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

const state = {
  session: savedSession(),
  user: null,
  profile: null,
  subscription: null,
  lessons: [],
  done: [],
  masteryRecords: [],
  mode: "login"
};
state.user = state.session?.user || null;

const dom = {
  app: document.querySelector("#app"),
  gate: document.querySelector("#authGate"),
  nav: document.querySelector(".bottom-nav"),
  avatarInitial: document.querySelector("#avatarInitial"),
  authMessage: document.querySelector("#authMessage"),
  loginTab: document.querySelector("#loginTab"),
  signupTab: document.querySelector("#signupTab"),
  signupOnly: document.querySelector(".signup-only"),
  forgotPassword: document.querySelector("#forgotPassword"),
  authSubmitText: document.querySelector("#authSubmitText"),
  authForm: document.querySelector("#authForm"),
  authEmail: /** @type {HTMLInputElement} */ (document.querySelector("#authEmail")),
  authPassword: /** @type {HTMLInputElement} */ (document.querySelector("#authPassword")),
  authName: /** @type {HTMLInputElement} */ (document.querySelector("#authName")),
  googleButton: document.querySelector("#googleBtn")
};

function headers() {
  return {
    apikey: KEY,
    ...(state.session?.access_token ? { Authorization: `Bearer ${state.session.access_token}` } : {}),
    "Content-Type": "application/json"
  };
}

async function api(path, options = {}) {
  const response = await fetch(URL + path, {
    ...options,
    headers: { ...headers(), ...options.headers }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Pedido falhou");
  }
  return response.status === 204 ? null : response.json();
}

function access() {
  return hasAccess(state.subscription);
}

function message(text, success = false) {
  dom.authMessage.textContent = text;
  dom.authMessage.classList.toggle("success", success);
}

function authMode(mode) {
  state.mode = mode;
  dom.loginTab.classList.toggle("active", mode === "login");
  dom.signupTab.classList.toggle("active", mode === "signup");
  dom.signupOnly.classList.toggle("hidden", mode !== "signup");
  dom.forgotPassword.classList.toggle("hidden", mode !== "login");
  dom.authSubmitText.textContent = mode === "login" ? "Entrar" : "Criar a minha conta";
  message("");
}

async function submitAuth(event) {
  event.preventDefault();
  message("A processar…", true);
  const email = dom.authEmail.value.trim();
  const password = dom.authPassword.value;
  const name = dom.authName.value.trim();
  try {
    if (state.mode === "signup" && !name) return message("Escreve o teu nome.");
    const signup = state.mode === "signup";
    const path = signup
      ? `/auth/v1/signup?redirect_to=${encodeURIComponent(BASE)}`
      : "/auth/v1/token?grant_type=password";
    const payload = signup ? { email, password, data: { full_name: name } } : { email, password };
    const response = await fetch(URL + path, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || data.msg || data.message);
    if (!data.access_token) return message("Conta criada. Confirma o email que enviámos.", true);
    state.session = data;
    state.user = data.user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    await start();
  } catch (error) {
    message(error.message || "Não foi possível entrar.");
  }
}

async function recoverPassword() {
  const email = dom.authEmail.value.trim();
  if (!email) return message("Escreve primeiro o teu email.");
  try {
    const response = await fetch(`${URL}/auth/v1/recover?redirect_to=${encodeURIComponent(BASE)}`, {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    message(response.ok ? "Enviámos as instruções para o teu email." : "Não foi possível enviar agora.", response.ok);
  } catch {
    message("Não foi possível enviar agora.");
  }
}

async function oauthRedirect() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const accessToken = fragment.get("access_token");
  if (!accessToken) return false;
  history.replaceState(null, "", location.pathname + location.search);
  const response = await fetch(`${URL}/auth/v1/user`, {
    headers: { apikey: KEY, Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error("Não foi possível concluir a autenticação.");
  const user = await response.json();
  state.session = {
    access_token: accessToken,
    refresh_token: fragment.get("refresh_token"),
    expires_in: Number(fragment.get("expires_in")),
    token_type: fragment.get("token_type"),
    user
  };
  state.user = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  return true;
}

async function loadAccount() {
  const userId = encodeURIComponent(state.user.id);
  const profiles = await api(`/rest/v1/profiles?select=*&id=eq.${userId}`);
  if (!profiles.length) {
    const name = state.user.user_metadata?.full_name || state.user.email.split("@")[0];
    await api("/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ id: state.user.id, full_name: name })
    });
    state.profile = { id: state.user.id, full_name: name, learning_goal: "Começar do zero" };
  } else {
    state.profile = profiles[0];
  }
  const subscriptions = await api(`/rest/v1/subscriptions?select=*&user_id=eq.${userId}`);
  state.subscription = subscriptions[0] || null;
  state.lessons = [];
  state.done = [];
  state.masteryRecords = [];
  if (access()) {
    state.lessons = await api("/rest/v1/lessons?select=*&published=eq.true&order=sort_order.asc");
    state.done = (await api(`/rest/v1/lesson_progress?select=lesson_id&user_id=eq.${userId}`))
      .map(item => item.lesson_id);
    // Mastery data is an enhancement, not a requirement: a learner with none yet (new
    // account), an old account predating Stage 1, or a transient database failure here must
    // never block the rest of the app — recommendNext already falls back to plain sequential
    // "advance" behaviour when masteryRecords is empty.
    try {
      state.masteryRecords = await api(
        `/rest/v1/learner_mastery?select=skill_key,mastery_score,attempts,correct_attempts&user_id=eq.${userId}`
      );
    } catch {
      state.masteryRecords = [];
    }
  }
}

function render(view = "home") {
  if (!access()) {
    dom.nav.classList.add("hidden");
    show(dom.app, ...paywallView(firstName(state.profile, state.user), {
      onCheckout: checkout,
      onLogout: logout
    }));
    return;
  }
  dom.nav.classList.remove("hidden");
  dom.nav.querySelectorAll("button").forEach(item =>
    item.classList.toggle("active", item.dataset.view === view));
  dom.avatarInitial.textContent = firstName(state.profile, state.user)[0].toUpperCase();
  const recommendation = recommendNext(state.lessons, state.done, state.masteryRecords);
  const context = {
    first: firstName(state.profile, state.user),
    profile: state.profile,
    user: state.user,
    subscription: state.subscription,
    lessons: state.lessons,
    done: state.done,
    percent: progress(state.done, state.lessons),
    recommendation
  };
  const handlers = { onView: render, onLesson: openLesson, onFollow: followRecommendation, onPortal: portal, onLogout: logout };
  if (view === "home") show(dom.app, ...homeView(context, handlers));
  else if (view === "courses") show(dom.app, ...coursesView(context, handlers));
  else if (view === "helper") {
    const next = recommendation.lesson;
    show(dom.app, ...helperView({ lessonId: next?.id ?? null, lessonTitle: next?.title ?? null }, { onAsk: askLia }));
  } else if (view === "profile") show(dom.app, ...accountView(context, handlers));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Stage 6: follows the home page's adaptive recommendation. "practice" opens an AI practice
// mission (Stage 7) instead of a lesson; every other action just opens the recommended lesson
// — the learner can always ignore this and browse all lessons via "Ver todas as aulas" instead.
function followRecommendation(recommendation) {
  if (!recommendation?.lesson) return render("courses");
  if (recommendation.action === "practice") return openPractice(recommendation.lesson);
  return openLesson(recommendation.lesson.id);
}

function openLesson(id) {
  const lesson = state.lessons.find(item => item.id === id);
  if (!lesson) return render("courses");
  show(dom.app, ...lessonView(lesson, state.lessons.length, state.done.includes(id), {
    onBack: () => render("courses"),
    onComplete: async () => {
      if (state.done.includes(id)) return;
      try {
        await api("/rest/v1/lesson_progress", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ user_id: state.user.id, lesson_id: id })
        });
        state.done.push(id);
        openQuiz(lesson);
      } catch (error) {
        dom.app.querySelector(".form-message").textContent = error.message || "Não foi possível guardar o progresso.";
      }
    },
    onExplain: () => askLia(id, "Não percebi esta lição. Podes explicar de outra maneira?", "explanation_request")
  }));
}

async function generateQuiz(lessonId) {
  const response = await fetch(`${FUNCTIONS}/quiz-generate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ lesson_id: lessonId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível gerar o teste.");
  return data;
}

// Stage 5: the AI only proposes questions; grading, the score and the mastery update are
// always calculated here, in the application, never by the model (see quizEngine.js).
async function recordQuizResults(lesson, results) {
  const skillKey = lesson.skill_key ?? null;
  const existing = state.masteryRecords.find(record => record.skill_key === skillKey);
  const percent = scoreQuiz(results);

  await Promise.all(results.map((result, questionIndex) => api("/rest/v1/learner_interactions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: state.user.id,
      lesson_id: lesson.id,
      skill_key: skillKey,
      interaction_type: "quiz",
      question: result.question,
      result: result.correct ? "correct" : "incorrect",
      metadata: {
        score: percent,
        attempt: questionIndex + 1,
        selected_index: result.selectedIndex,
        correct_index: result.correctIndex
      }
    })
  })));

  let masteryScore = percent;
  if (skillKey) {
    const folded = foldQuizIntoMastery(existing, results);
    masteryScore = folded.score;
    await api("/rest/v1/learner_mastery", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        user_id: state.user.id,
        skill_key: skillKey,
        mastery_score: folded.score,
        attempts: folded.attempts,
        correct_attempts: folded.correctAttempts,
        last_activity_at: new Date().toISOString()
      })
    });
    const updated = { skill_key: skillKey, mastery_score: folded.score, attempts: folded.attempts, correct_attempts: folded.correctAttempts };
    const recordIndex = state.masteryRecords.findIndex(record => record.skill_key === skillKey);
    if (recordIndex >= 0) state.masteryRecords[recordIndex] = updated;
    else state.masteryRecords.push(updated);
  }

  return { percent, action: quizAction(masteryScore) };
}

function openQuiz(lesson) {
  show(dom.app, noticeView("A preparar o teste…", "Só demora um instante."));
  generateQuiz(lesson.id)
    .then(quiz => {
      show(dom.app, ...quizView(lesson, quiz, {
        onFinish: async results => {
          try {
            const { percent, action } = await recordQuizResults(lesson, results);
            show(dom.app, ...quizResultView(percent, action, { onContinue: () => render("courses") }));
          } catch (error) {
            show(dom.app, noticeView("Não foi possível guardar o resultado", error.message || "Tenta novamente mais tarde."));
          }
        },
        onSkip: () => render("courses")
      }));
    })
    .catch(error => {
      show(dom.app, noticeView("Não foi possível preparar o teste", error.message || "Tenta novamente mais tarde."));
    });
}

async function generateMission(lessonId) {
  const response = await fetch(`${FUNCTIONS}/practice-mission`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ lesson_id: lessonId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível gerar a missão.");
  return data;
}

// Stage 7: the outcome the learner picks is the mastery signal — "Consegui" is the only
// outcome that folds in as a correct graded "practice" attempt.
async function recordMissionOutcome(lesson, mission, outcome) {
  const skillKey = lesson.skill_key ?? null;
  await api("/rest/v1/learner_interactions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: state.user.id,
      lesson_id: lesson.id,
      skill_key: skillKey,
      interaction_type: "practice",
      question: mission.mission,
      result: outcome,
      metadata: { difficulty: mission.difficulty }
    })
  });

  if (!skillKey) return;
  const existing = state.masteryRecords.find(record => record.skill_key === skillKey);
  const folded = nextMastery(
    { score: existing?.mastery_score ?? 0, attempts: existing?.attempts ?? 0, correctAttempts: existing?.correct_attempts ?? 0 },
    { type: "practice", correct: outcome === "Consegui" }
  );
  await api("/rest/v1/learner_mastery", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: state.user.id,
      skill_key: skillKey,
      mastery_score: folded.score,
      attempts: folded.attempts,
      correct_attempts: folded.correctAttempts,
      last_activity_at: new Date().toISOString()
    })
  });
  const updated = { skill_key: skillKey, mastery_score: folded.score, attempts: folded.attempts, correct_attempts: folded.correctAttempts };
  const recordIndex = state.masteryRecords.findIndex(record => record.skill_key === skillKey);
  if (recordIndex >= 0) state.masteryRecords[recordIndex] = updated;
  else state.masteryRecords.push(updated);
}

function openPractice(lesson) {
  show(dom.app, noticeView("A preparar a tua missão…", "Só demora um instante."));
  generateMission(lesson.id)
    .then(mission => {
      show(dom.app, ...practiceView(lesson, mission, {
        onBack: () => render("home"),
        onOutcome: async outcome => {
          try {
            await recordMissionOutcome(lesson, mission, outcome);
            show(dom.app, noticeView("Boa!", "Registámos a tua missão. Continua quando quiseres."));
            setTimeout(() => render("home"), 1500);
          } catch (error) {
            show(dom.app, noticeView("Não foi possível guardar o resultado", error.message || "Tenta novamente mais tarde."));
          }
        }
      }));
    })
    .catch(error => {
      show(dom.app, noticeView("Não foi possível preparar a missão", error.message || "Tenta novamente mais tarde."));
    });
}

async function checkout(button, output) {
  button.disabled = true;
  button.textContent = "A abrir pagamento…";
  try {
    const response = await fetch(`${FUNCTIONS}/create-checkout`, { method: "POST", headers: headers() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    location.href = data.url;
  } catch (error) {
    output.textContent = error.message || "Não foi possível abrir o pagamento.";
    button.disabled = false;
    button.textContent = "Tentar novamente";
  }
}

async function askLia(lessonId, message, interactionType) {
  const response = await fetch(`${FUNCTIONS}/ai-tutor`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ lesson_id: lessonId, message, interaction_type: interactionType })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível obter resposta da Lia.");
  return data;
}

async function portal(output) {
  try {
    const response = await fetch(`${FUNCTIONS}/customer-portal`, { method: "POST", headers: headers() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    location.href = data.url;
  } catch (error) {
    output.textContent = error.message || "Não foi possível abrir o portal.";
  }
}

async function logout() {
  if (state.session) {
    await fetch(`${URL}/auth/v1/logout`, { method: "POST", headers: headers() }).catch(() => {});
  }
  localStorage.removeItem(SESSION_KEY);
  location.reload();
}

async function start() {
  dom.gate.classList.add("hidden");
  try {
    await loadAccount();
    dom.nav.classList.toggle("hidden", !access());
    if (new URLSearchParams(location.search).get("checkout") === "success") {
      show(dom.app, noticeView("Pagamento recebido", "Estamos a confirmar o teu acesso. A página atualizará dentro de instantes."));
      setTimeout(() => { location.href = BASE; }, 4000);
    } else {
      render("home");
    }
  } catch (error) {
    dom.nav.classList.add("hidden");
    show(dom.app, noticeView("Não foi possível carregar a conta", error.message || "Tenta novamente mais tarde."));
  }
}

dom.loginTab.addEventListener("click", () => authMode("login"));
dom.signupTab.addEventListener("click", () => authMode("signup"));
dom.authForm.addEventListener("submit", submitAuth);
dom.forgotPassword.addEventListener("click", recoverPassword);
dom.googleButton.addEventListener("click", () => {
  location.href = `${URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(BASE)}`;
});
document.querySelectorAll("[data-view]").forEach(item =>
  item.addEventListener("click", () => render(item.getAttribute("data-view") || "home")));

try {
  if (await oauthRedirect() || state.session?.access_token) await start();
  else dom.gate.classList.remove("hidden");
} catch (error) {
  dom.gate.classList.remove("hidden");
  message(error.message || "Não foi possível entrar.");
}
