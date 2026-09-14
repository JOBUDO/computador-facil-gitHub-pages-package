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

export function homeView({ first, lessons, done, percent }, { onView, onLesson }) {
  const next = lessons.find(item => !done.includes(item.id)) || lessons[0];
  const continueCard = next
    ? button("continue-card", "", () => onLesson(next.id))
    : el("p", "", "As aulas aparecerão aqui em breve.");
  if (next) {
    continueCard.replaceChildren(
      el("span", "lesson-icon", next.icon),
      el("span", "", el("h3", "", next.title),
        el("p", "", `${next.duration_minutes} min · ${next.level}`), progressTrack(percent)),
      el("span", "round-arrow", "→")
    );
  }
  return [
    el("section", "hero", el("p", "eyebrow", "O TEU PLANO PERSONALIZADO"),
      el("h1", "", `Olá, ${first}! 👋`),
      el("p", "", "Hoje basta uma pequena conquista. Continua ao teu ritmo."),
      el("span", "streak", "✓ Acesso ativo")),
    el("div", "section-title", el("h2", "", "Continua a aprender"),
      button("", "Ver todas", () => onView("courses"))),
    continueCard,
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
          el("span", "lesson-icon", completed ? "✓" : lesson.icon),
          el("span", "", el("h3", "", `${index + 1}. ${lesson.title}`),
            el("p", "", lesson.description),
            el("span", "tag", `${lesson.duration_minutes} min · ${lesson.level}`)),
          el("span", "", completed ? "✅" : "›")
        );
        return card;
      })
  ];
}

export function lessonView(lesson, total, completed, { onBack, onComplete }) {
  const completeButton = button("primary full",
    [completed ? "Concluída ✓" : "Marcar como concluída", el("span", "", "→")], onComplete);
  const message = el("p", "form-message");
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
      completeButton, message)
  ];
}

export function helperView() {
  const answerArea = el("div", "");
  const questions = [
    ["📋 Como copiar e colar?", "Para copiar, seleciona o texto e usa Ctrl + C. Para colar, usa Ctrl + V."],
    ["📁 Como criar uma pasta?", "Clica com o botão direito, escolhe Novo e depois Pasta."],
    ["🛡️ Como reconhecer um email falso?", "Confirma o remetente e desconfia de urgência, dinheiro ou pedidos de palavra-passe."]
  ];
  return [
    el("div", "helper-card", el("div", "helper-orb"), el("h2", "", "Olá, sou a Lia"),
      el("p", "", "Explico cada passo em português simples, sem pressa.")),
    el("div", "section-title", el("h2", "", "Como posso ajudar?")),
    answerArea,
    el("div", "quick-questions", ...questions.map(([question, answer]) =>
      button("", question, () => show(answerArea, el("div", "answer", el("strong", "", "Lia:"), el("br", ""), answer)))))
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

export function noticeView(title, message) {
  return el("div", "instruction", el("h3", "", title), el("p", "", message));
}
