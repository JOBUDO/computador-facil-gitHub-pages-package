import { resolveRecommendedLesson } from "./masteryEngine.js";

// Every dynamic value is appended as a text node. No backend field is parsed as HTML.
function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children.flat(Infinity)) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

function button(className, label, onClick) {
  const node = el("button", className, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function progressTrack(value) {
  const bar = el("span", "progress-bar");
  bar.style.width = `${value}%`;
  return el("span", "progress-track", bar);
}

const ICON_GRADIENTS = ["", "g2", "g3", "g4"];
function iconGradient(index) {
  return ICON_GRADIENTS[index % ICON_GRADIENTS.length];
}

function tagVariant(level) {
  if (level === "Iniciante") return "tag-beginner";
  if (level === "Intermédio") return "tag-intermediate";
  return "";
}

export function show(root, ...children) {
  root.replaceChildren(...children);
}

export function paywallView(first, { onCheckout, onLogout }) {
  const checkoutMessage = el("p", "form-message");
  const checkoutButton = button("primary full", ["Começar por £5", el("span", "", "→")],
    () => onCheckout(checkoutButton, checkoutMessage));
  return [
    el("header", "page-heading", el("p", "eyebrow", "CONTA CRIADA"),
      el("h1", "", "Desbloqueia a tua aprendizagem"), el("p", "", `Olá, ${first}. O teu plano está pronto.`)),
    el("section", "paywall", el("span", "status-pill", "4 DIAS DE ACESSO COMPLETO"),
      el("div", "paywall-price", "£5 ", el("small", "", "pagamento inicial")),
      el("ul", "paywall-list", ...[
        "Todas as aulas em português", "Exercícios práticos passo a passo",
        "Progresso guardado na tua conta", "Assistente de aprendizagem Lia"
      ].map(item => el("li", "", item))),
      checkoutButton,
      el("p", "billing-note", "Hoje pagas £5. Após quatro dias, a assinatura continua por £15.99 por mês até cancelares."),
      checkoutMessage),
    button("text-button", "Sair desta conta", onLogout)
  ];
}

const RECOMMENDATION_COPY = {
  advance: { eyebrow: "PRÓXIMA AULA RECOMENDADA" },
  reinforce: { eyebrow: "VAMOS REVER ISTO PRIMEIRO", note: "Ainda estás a praticar esta competência." },
  practice: { eyebrow: "MISSÃO RÁPIDA", note: lessonTitle => `Vamos praticar um pouco antes de "${lessonTitle}".` },
  review_prerequisite: { eyebrow: "VAMOS REVER A BASE PRIMEIRO", note: "Vale a pena consolidar isto antes de avançar." }
};

// Stage 6: the "Continua a aprender" card follows recommendNext's { lesson, action } — falling
// back to the original sequential "advance" behaviour whenever there is no mastery data at
// all (new/old accounts, incomplete metadata, or masteryRecords defaulting to [] after a
// database failure in app.js). The learner always keeps "Ver todas" to browse freely.
export function homeView({ first, lessons, done, percent, recommendation }, { onView, onFollow }) {
  const action = recommendation?.action;
  // For "review_prerequisite", show (and open) the lesson that actually teaches the missing
  // prerequisite skill, not the locked lesson recommendNext names — otherwise the card's
  // "rever isto primeiro" copy would point at content the learner still can't do yet.
  const next = resolveRecommendedLesson(lessons, recommendation);
  const copy = RECOMMENDATION_COPY[action] || RECOMMENDATION_COPY.advance;
  const continueCard = next
    ? button("continue-card", "", () => onFollow(recommendation))
    : el("p", "", "As aulas aparecerão aqui em breve.");
  if (next) {
    const gradient = iconGradient(lessons.indexOf(next));
    const note = typeof copy.note === "function" ? copy.note(next.title) : copy.note;
    continueCard.replaceChildren(
      el("span", `lesson-icon ${gradient}`.trim(), next.icon),
      el("span", "", el("h3", "", next.title),
        el("p", "", note || `${next.duration_minutes} min · ${next.level}`), progressTrack(percent)),
      el("span", "round-arrow", "→")
    );
  }
  return [
    el("section", "hero", el("p", "eyebrow", "O TEU PLANO PERSONALIZADO"),
      el("h1", "", `Olá, ${first}! 👋`),
      el("p", "", "Hoje basta uma pequena conquista. Continua ao teu ritmo."),
      el("span", "streak", "✓ Acesso ativo")),
    el("div", "section-title", el("h2", "", "Continua a aprender"),
      button("", "Ver todas as aulas", () => onView("courses"))),
    next ? el("p", "eyebrow", copy.eyebrow) : null,
    continueCard,
    next ? button("text-button", "Seguir recomendação", () => onFollow(recommendation)) : null,
    el("div", "section-title", el("h2", "", "O teu progresso")),
    el("div", "profile-card", el("div", "stats",
      el("div", "stat", el("strong", "", done.length), el("span", "", "AULAS")),
      el("div", "stat", el("strong", "", `${percent}%`), el("span", "", "PROGRESSO")),
      el("div", "stat", el("strong", "", lessons.length), el("span", "", "TOTAL"))))
  ];
}

export function coursesView({ profile, lessons, done, percent }, { onLesson }) {
  return [
    el("header", "page-heading", el("p", "eyebrow", "A TUA JORNADA"),
      el("h1", "", "Aulas práticas"),
      el("p", "", `${done.length} de ${lessons.length} concluídas · ${percent}%`),
      progressTrack(percent)),
    el("div", "section-title", el("h2", "", `Plano: ${profile?.learning_goal || "Começar do zero"}`)),
    ...lessons.map((lesson, index) => {
        const card = button("course-card", "", () => onLesson(lesson.id));
        const completed = done.includes(lesson.id);
        card.replaceChildren(
          el("span", `lesson-icon ${iconGradient(index)}`.trim(), completed ? "✓" : lesson.icon),
          el("span", "", el("h3", "", `${index + 1}. ${lesson.title}`),
            el("p", "", lesson.description),
            el("span", `tag ${tagVariant(lesson.level)}`.trim(), `${lesson.duration_minutes} min · ${lesson.level}`)),
          el("span", "", completed ? "✅" : "›")
        );
        return card;
      })
  ];
}

export function lessonView(lesson, total, completed, { onBack, onComplete, onExplain }) {
  const completeButton = button("primary full",
    [completed ? "Concluída ✓" : "Marcar como concluída", el("span", "", "→")], onComplete);
  const message = el("p", "form-message");

  const explainStatus = el("p", "form-message");
  const explanationPanel = el("div", "answer explanation-panel hidden");
  const explainButton = button("text-button", "Não percebi? Pede outra explicação", requestExplanation);

  async function requestExplanation() {
    if (!onExplain) return;
    explainButton.disabled = true;
    explainStatus.textContent = "A Lia está a preparar uma explicação diferente…";
    try {
      const result = await onExplain();
      explanationPanel.classList.remove("hidden");
      explanationPanel.replaceChildren(
        el("strong", "", "Lia: "), result.response, el("br", ""),
        button("text-button", "Entendi agora", () => {
          explanationPanel.classList.add("hidden");
          explainStatus.textContent = "";
        }),
        button("text-button", "Ainda não percebi", requestExplanation)
      );
      explainStatus.textContent = "";
    } catch (error) {
      explainStatus.textContent = error.message || "Não foi possível obter resposta da Lia.";
    } finally {
      explainButton.disabled = false;
    }
  }

  return [
    el("div", "lesson-top", button("back", "‹", onBack),
      el("div", "", el("p", "eyebrow", `LIÇÃO ${lesson.sort_order} DE ${total}`),
        el("h1", "", lesson.title))),
    el("div", "video-card", el("div", "", el("span", "play", "▶"),
      el("p", "", `Demonstração guiada · ${lesson.duration_minutes} min`))),
    el("div", "instruction", el("h3", "", "Como aprender"),
      el("div", "step", el("b", "", "1"), el("span", "", "Vê a demonstração devagar e pausa quando precisares.")),
      el("div", "step", el("b", "", "2"), el("span", "", "Repete cada ação no teu computador."))),
    el("div", "instruction", el("h3", "", "Missão prática"), el("p", "", lesson.mission),
      completeButton, message,
      ...(onExplain ? [explainButton, explainStatus, explanationPanel] : []))
  ];
}

/**
 * @param {{ lessonId?: number|null, lessonTitle?: string|null }} context
 * @param {{ onAsk?: (lessonId: number|null, message: string, interactionType: string) => Promise<{response: string}> }} handlers
 */
export function helperView({ lessonId = null, lessonTitle = null } = {}, { onAsk } = {}) {
  const answerArea = el("div", "");
  const questions = [
    ["📋 Como copiar e colar?", "Para copiar, seleciona o texto e usa Ctrl + C. Para colar, usa Ctrl + V."],
    ["📁 Como criar uma pasta?", "Clica com o botão direito, escolhe Novo e depois Pasta."],
    ["🛡️ Como reconhecer um email falso?", "Confirma o remetente e desconfia de urgência, dinheiro ou pedidos de palavra-passe."]
  ];

  const log = el("div", "lia-log");
  const status = el("p", "form-message");
  const input = el("input", "");
  input.type = "text";
  input.placeholder = lessonTitle ? `Pergunta sobre "${lessonTitle}"…` : "Escreve a tua pergunta…";
  const sendButton = button("", "➤", () => ask(input.value, "help_request"));

  async function ask(message, interactionType) {
    if (!message.trim() || !onAsk) return;
    log.append(el("div", "answer mine", message));
    input.value = "";
    input.disabled = true;
    sendButton.disabled = true;
    status.textContent = "A Lia está a pensar…";
    try {
      const result = await onAsk(lessonId, message, interactionType);
      log.append(el("div", "answer", el("strong", "", "Lia: "), result.response));
      status.textContent = "";
    } catch (error) {
      status.textContent = error.message || "Não foi possível obter resposta da Lia.";
    } finally {
      input.disabled = false;
      sendButton.disabled = false;
    }
  }

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      ask(input.value, "help_request");
    }
  });

  const quickActions = [
    ["Explica de outra maneira", "explanation_request"],
    ["Explica de forma mais simples", "explanation_request"],
    ["Dá-me um exemplo", "explanation_request"],
    ["Guia-me passo a passo", "hint"]
  ];

  return [
    el("div", "helper-card", el("div", "helper-orb"), el("h2", "", "Olá, sou a Lia"),
      el("p", "", "Explico cada passo em português simples, sem pressa.")),
    el("div", "section-title", el("h2", "", "Como posso ajudar?")),
    answerArea,
    el("div", "quick-questions", ...questions.map(([question, answer]) =>
      button("", question, () => show(answerArea, el("div", "answer", el("strong", "", "Lia:"), el("br", ""), answer))))),
    el("div", "section-title", el("h2", "", "Pergunta à Lia")),
    log,
    el("div", "quick-questions", ...quickActions.map(([label, type]) => button("", label, () => ask(label, type)))),
    el("div", "chatbox", input, sendButton),
    status
  ];
}

/**
 * @param {{ title: string, questions: Array<{question: string, options: string[], correct_index: number, explanation: string}> }} lesson
 * @param {{ questions: Array<{question: string, options: string[], correct_index: number, explanation: string}> }} quiz
 * @param {{ onFinish: (results: Array<{question: string, correct: boolean, selectedIndex: number, correctIndex: number, explanation: string}>) => void, onSkip: () => void }} handlers
 */
export function quizView(lesson, quiz, { onFinish, onSkip }) {
  const questions = quiz.questions;
  const results = [];
  let index = 0;
  const container = el("div", "quiz-container");

  function renderQuestion() {
    const question = questions[index];
    const feedback = el("div", "form-message");
    const optionButtons = question.options.map((option, optionIndex) =>
      button("quiz-option", option, () => selectOption(optionIndex)));

    container.replaceChildren(
      el("p", "eyebrow", `PERGUNTA ${index + 1} DE ${questions.length}`),
      el("h3", "", question.question),
      el("div", "quiz-options", ...optionButtons),
      feedback
    );

    function selectOption(selectedIndex) {
      const correct = selectedIndex === question.correct_index;
      optionButtons.forEach((optionButton, optionIndex) => {
        optionButton.disabled = true;
        if (optionIndex === question.correct_index) optionButton.classList.add("correct");
        else if (optionIndex === selectedIndex) optionButton.classList.add("incorrect");
      });
      results.push({
        question: question.question,
        correct,
        selectedIndex,
        correctIndex: question.correct_index,
        explanation: question.explanation
      });
      const isLast = index === questions.length - 1;
      feedback.replaceChildren(
        el("p", "", correct ? "Muito bem! ✓" : "Não é bem isso."),
        el("p", "", question.explanation),
        button("primary full", isLast ? "Ver resultado" : "Continuar", () => {
          if (isLast) return onFinish(results);
          index += 1;
          renderQuestion();
        })
      );
    }
  }

  renderQuestion();

  return [
    el("header", "page-heading", el("p", "eyebrow", "TESTE RÁPIDO"), el("h1", "", `Mini teste: ${lesson.title}`)),
    container,
    button("text-button", "Saltar por agora", onSkip)
  ];
}

const QUIZ_ACTION_COPY = {
  reinforce: { title: "Vamos reforçar", body: "Ainda estás a aprender esta competência — vale a pena rever a lição outra vez." },
  practice: { title: "Vamos praticar", body: "Estás no bom caminho. Um pouco de prática vai ajudar a consolidar." },
  advance: { title: "Estás a avançar bem!", body: "Já dominas bem esta competência. Podes seguir para a próxima aula." },
  review_prerequisite: { title: "Vamos rever a base primeiro", body: "Vale a pena consolidar uma competência anterior antes de continuar." }
};

export function quizResultView(percent, action, { onContinue }) {
  const copy = QUIZ_ACTION_COPY[action] || QUIZ_ACTION_COPY.practice;
  return [
    el("header", "page-heading", el("p", "eyebrow", "RESULTADO DO TESTE"), el("h1", "", copy.title)),
    el("div", "profile-card", el("div", "stats",
      el("div", "stat", el("strong", "", `${percent}%`), el("span", "", "CORRETO")))),
    el("p", "", copy.body),
    button("primary full", "Continuar", onContinue)
  ];
}

const DIFFICULTY_LABEL = { easy: "Fácil", standard: "Normal", challenge: "Desafio" };

/**
 * @param {{ title: string }} lesson
 * @param {{ mission: string, difficulty: string }} mission
 * @param {{ onOutcome: (outcome: "Consegui"|"Preciso de ajuda"|"Não consegui") => void, onBack: () => void }} handlers
 */
export function practiceView(lesson, mission, { onOutcome, onBack }) {
  const status = el("p", "form-message");
  /** @type {Array<"Consegui"|"Preciso de ajuda"|"Não consegui">} */
  const outcomes = ["Consegui", "Preciso de ajuda", "Não consegui"];
  const outcomeButtons = outcomes.map(outcome =>
    button("", outcome, () => {
      outcomeButtons.forEach(outcomeButton => { outcomeButton.disabled = true; });
      status.textContent = "A guardar…";
      onOutcome(outcome);
    }));
  return [
    el("div", "lesson-top", button("back", "‹", onBack),
      el("div", "", el("p", "eyebrow", `MISSÃO PRÁTICA · ${DIFFICULTY_LABEL[mission.difficulty] || "Normal"}`),
        el("h1", "", lesson.title))),
    el("div", "instruction", el("h3", "", "A tua missão"), el("p", "", mission.mission)),
    el("div", "instruction", el("h3", "", "Como correu?"),
      el("div", "quick-questions", ...outcomeButtons), status)
  ];
}

export function accountView({ first, profile, user, subscription }, { onPortal, onLogout }) {
  const end = new Date(subscription.access_ends_at).toLocaleDateString("pt-PT");
  const portalMessage = el("p", "form-message");
  return [
    el("header", "page-heading", el("p", "eyebrow", "O TEU ESPAÇO"), el("h1", "", "Perfil")),
    el("section", "profile-card", el("div", "large-avatar", first[0].toUpperCase()),
      el("h2", "", profile.full_name), el("p", "", user.email),
      el("span", "status-pill", `ACESSO ATÉ ${end}`)),
    el("div", "settings", button("", ["Gerir assinatura e pagamentos", el("span", "", "›")],
      () => onPortal(portalMessage)),
      button("", ["Terminar sessão", el("span", "", "›")], onLogout)),
    portalMessage
  ];
}

export function noticeView(title, message, { onRetry = undefined, retryLabel = "Continuar" } = {}) {
  const children = [el("h3", "", title), el("p", "", message)];
  if (onRetry) children.push(button("primary full", retryLabel, onRetry));
  return el("div", "instruction", ...children);
}
