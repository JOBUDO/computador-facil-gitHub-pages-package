const URL = "https://nhmzuqhjhkdklezimmll.supabase.co",
  KEY = "sb_publishable_kPQkmWNskYEF979I7d6jUg__XIBQErT",
  FN = URL + "/functions/v1",
  SK = "computador-facil-session";
let session = JSON.parse(localStorage.getItem(SK) || "null"),
  user = session?.user,
  profile, sub, lessons = [],
  done = [],
  mode = "login";
const app = document.querySelector("#app"),
  gate = document.querySelector("#authGate");
const headers = () => ({
  apikey: KEY,
  Authorization: "Bearer " + session.access_token,
  "Content-Type": "application/json"
});
async function api(path, opt = {}) {
  const r = await fetch(URL + path, {
    ...opt,
    headers: {
      ...headers(),
      ...opt.headers
    }
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Pedido falhou");
  return r.status === 204 ? null : r.json()
}
const access = () => sub && ["trialing", "active"].includes(sub.status) && new Date(sub.access_ends_at) > new Date();
const first = () => (profile?.full_name || user?.email?.split("@")[0] || "Amigo").trim().split(/\s+/)[0];
const pct = () => lessons.length ? Math.round(done.length / lessons.length * 100) : 0;

function msg(t, ok = false) {
  const e = document.querySelector("#authMessage");
  e.textContent = t;
  e.classList.toggle("success", ok)
}

function authMode(m) {
  mode = m;
  loginTab.classList.toggle("active", m === "login");
  signupTab.classList.toggle("active", m === "signup");
  document.querySelector(".signup-only").classList.toggle("hidden", m !== "signup");
  forgotPassword.classList.toggle("hidden", m !== "login");
  authSubmitText.textContent = m === "login" ? "Entrar" : "Criar a minha conta";
  msg("")
}
loginTab.onclick = () => authMode("login");
signupTab.onclick = () => authMode("signup");
authForm.onsubmit = async e => {
  e.preventDefault();
  msg("A processar…", true);
  const email = authEmail.value.trim(),
    password = authPassword.value,
    name = authName.value.trim();
  try {
    let r;
    if (mode === "signup") {
      if (!name) return msg("Escreve o teu nome.");
      r = await fetch(URL + "/auth/v1/signup?redirect_to=" + encodeURIComponent(location.origin), {
        method: "POST",
        headers: {
          apikey: KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          data: {
            full_name: name
          }
        })
      })
    } else r = await fetch(URL + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        apikey: KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error_description || d.msg || d.message);
    if (!d.access_token) return msg("Conta criada. Confirma o email que enviámos.", true);
    session = d;
    user = d.user;
    localStorage.setItem(SK, JSON.stringify(d));
    start()
  } catch (x) {
    msg(x.message || "Não foi possível entrar.")
  }
};
forgotPassword.onclick = async () => {
  const email = authEmail.value.trim();
  if (!email) return msg("Escreve primeiro o teu email.");
  const r = await fetch(URL + "/auth/v1/recover?redirect_to=" + encodeURIComponent(location.origin), {
    method: "POST",
    headers: {
      apikey: KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email
    })
  });
  msg(r.ok ? "Enviámos as instruções para o teu email." : "Não foi possível enviar agora.", r.ok)
};
googleBtn.onclick = () => location.href = URL + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(location.origin);
async function oauthRedirect() {
  const h = new URLSearchParams(location.hash.slice(1));
  const at = h.get("access_token");
  if (!at) return false;
  history.replaceState(null, "", location.pathname + location.search);
  const u = await (await fetch(URL + "/auth/v1/user", {
    headers: {
      apikey: KEY,
      Authorization: "Bearer " + at
    }
  })).json();
  session = {
    access_token: at,
    refresh_token: h.get("refresh_token"),
    expires_in: +h.get("expires_in"),
    token_type: h.get("token_type"),
    user: u
  };
  user = u;
  localStorage.setItem(SK, JSON.stringify(session));
  return true
}
async function load() {
  let p = await api("/rest/v1/profiles?select=*&id=eq." + user.id);
  if (!p.length) {
    const n = user.user_metadata?.full_name || user.email.split("@")[0];
    await api("/rest/v1/profiles", {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        id: user.id,
        full_name: n
      })
    });
    profile = {
      id: user.id,
      full_name: n,
      learning_goal: "Começar do zero"
    }
  } else profile = p[0];
  const s = await api("/rest/v1/subscriptions?select=*&user_id=eq." + user.id);
  sub = s[0] || null;
  if (access()) {
    lessons = await api("/rest/v1/lessons?select=*&published=eq.true&order=sort_order.asc");
    done = (await api("/rest/v1/lesson_progress?select=lesson_id&user_id=eq." + user.id)).map(x => x.lesson_id)
  }
}

function bind() {
  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => render(b.dataset.view));
  document.querySelectorAll("[data-lesson]").forEach(b => b.onclick = () => lesson(+b.dataset.lesson))
}

function render(v = "home") {
  if (!access()) return paywall();
  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  avatarInitial.textContent = first()[0].toUpperCase();
  if (v === "home") home();
  if (v === "courses") courses();
  if (v === "helper") helper();
  if (v === "profile") account();
  bind();
  scrollTo({
    top: 0,
    behavior: "smooth"
  })
}

function paywall() {
  document.querySelector(".bottom-nav").classList.add("hidden");
  app.innerHTML = `<header class="page-heading"><p class="eyebrow">CONTA CRIADA</p><h1>Desbloqueia a tua aprendizagem</h1><p>Olá, ${first()}. O teu plano está pronto.</p></header><section class="paywall"><span class="status-pill">4 DIAS DE ACESSO COMPLETO</span><div class="paywall-price">£5 <small>pagamento inicial</small></div><ul class="paywall-list"><li>Todas as aulas em português</li><li>Exercícios práticos passo a passo</li><li>Progresso guardado na tua conta</li><li>Assistente de aprendizagem Lia</li></ul><button class="primary full" id="checkoutBtn">Começar por £5 <span>→</span></button><p class="billing-note">Hoje pagas £5. Após quatro dias, a assinatura continua por £15.99 por mês até cancelares.</p><p id="checkoutMessage" class="form-message"></p></section><button class="text-button" id="logoutBtn">Sair desta conta</button>`;
  checkoutBtn.onclick = checkout;
  logoutBtn.onclick = logout
}
async function checkout() {
  checkoutBtn.disabled = true;
  checkoutBtn.textContent = "A abrir pagamento…";
  try {
    const r = await fetch(FN + "/create-checkout", {
        method: "POST",
        headers: headers()
      }),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    location.href = d.url
  } catch (x) {
    checkoutMessage.textContent = x.message;
    checkoutBtn.disabled = false;
    checkoutBtn.textContent = "Tentar novamente"
  }
}

function home() {
  const n = lessons.find(x => !done.includes(x.id)) || lessons[0];
  app.innerHTML = `<section class="hero"><p class="eyebrow">O TEU PLANO PERSONALIZADO</p><h1>Olá, ${first()}! 👋</h1><p>Hoje basta uma pequena conquista. Continua ao teu ritmo.</p><span class="streak">✓ Acesso ativo</span></section><div class="section-title"><h2>Continua a aprender</h2><button data-view="courses">Ver todas</button></div><button class="continue-card" data-lesson="${n.id}"><span class="lesson-icon">${n.icon}</span><span><h3>${n.title}</h3><p>${n.duration_minutes} min · ${n.level}</p><span class="progress-track"><span class="progress-bar" style="display:block;width:${pct()}%"></span></span></span><span class="round-arrow">→</span></button><div class="section-title"><h2>O teu progresso</h2></div><div class="profile-card"><div class="stats"><div class="stat"><strong>${done.length}</strong><span>AULAS</span></div><div class="stat"><strong>${pct()}%</strong><span>PROGRESSO</span></div><div class="stat"><strong>${lessons.length}</strong><span>TOTAL</span></div></div></div>`
}

function courses() {
  app.innerHTML = `<header class="page-heading"><p class="eyebrow">A TUA JORNADA</p><h1>Aulas práticas</h1><p>${done.length} de ${lessons.length} concluídas · ${pct()}%</p><div class="progress-track"><div class="progress-bar" style="width:${pct()}%"></div></div></header><div class="section-title"><h2>Plano: ${profile.learning_goal}</h2></div>${lessons.map((l,i)=>`<button class="course-card" data-lesson="${l.id}"><span class="lesson-icon">${done.includes(l.id)?"✓":l.icon}</span><span><h3>${i+1}. ${l.title}</h3><p>${l.description}</p><span class="tag">${l.duration_minutes} min · ${l.level}</span></span><span>${done.includes(l.id)?"✅":"›"}</span></button>`).join("")}`
}

function lesson(id) {
  const l = lessons.find(x => x.id === id);
  app.innerHTML = `<div class="lesson-top"><button class="back" data-view="courses">‹</button><div><p class="eyebrow">LIÇÃO ${l.sort_order} DE ${lessons.length}</p><h1>${l.title}</h1></div></div><div class="video-card"><div><button class="play">▶</button><p>Demonstração guiada · ${l.duration_minutes} min</p></div></div><div class="instruction"><h3>Como aprender</h3><div class="step"><b>1</b><span>Vê a demonstração devagar e pausa quando precisares.</span></div><div class="step"><b>2</b><span>Repete cada ação no teu computador.</span></div></div><div class="instruction"><h3>Missão prática</h3><p>${l.mission}</p><button class="primary full" id="completeBtn">${done.includes(id)?"Concluída ✓":"Marcar como concluída"} <span>→</span></button></div>`;
  completeBtn.onclick = async () => {
    if (!done.includes(id)) {
      await api("/rest/v1/lesson_progress", {
        method: "POST",
        headers: {
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          user_id: user.id,
          lesson_id: id
        })
      });
      done.push(id);
      courses();
      bind()
    }
  };
  bind()
}

function helper() {
  app.innerHTML = `<div class="helper-card"><div class="helper-orb"></div><h2>Olá, sou a Lia</h2><p>Explico cada passo em português simples, sem pressa.</p></div><div class="section-title"><h2>Como posso ajudar?</h2></div><div id="answerArea"></div><div class="quick-questions"><button data-q="Para copiar, seleciona o texto e usa Ctrl + C. Para colar, usa Ctrl + V.">📋 Como copiar e colar?</button><button data-q="Clica com o botão direito, escolhe Novo e depois Pasta.">📁 Como criar uma pasta?</button><button data-q="Confirma o remetente e desconfia de urgência, dinheiro ou pedidos de palavra-passe.">🛡️ Como reconhecer um email falso?</button></div>`;
  document.querySelectorAll("[data-q]").forEach(b => b.onclick = () => answerArea.innerHTML = `<div class="answer"><strong>Lia:</strong><br>${b.dataset.q}</div>`)
}

function account() {
  const end = new Date(sub.access_ends_at).toLocaleDateString("pt-PT");
  app.innerHTML = `<header class="page-heading"><p class="eyebrow">O TEU ESPAÇO</p><h1>Perfil</h1></header><section class="profile-card"><div class="large-avatar">${first()[0].toUpperCase()}</div><h2>${profile.full_name}</h2><p>${user.email}</p><span class="status-pill">ACESSO ATÉ ${end}</span></section><div class="settings"><button id="portalBtn">Gerir assinatura e pagamentos <span>›</span></button><button id="logoutBtn">Terminar sessão <span>›</span></button></div><p id="portalMessage" class="form-message"></p>`;
  portalBtn.onclick = portal;
  logoutBtn.onclick = logout
}
async function portal() {
  try {
    const r = await fetch(FN + "/customer-portal", {
        method: "POST",
        headers: headers()
      }),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    location.href = d.url
  } catch (x) {
    portalMessage.textContent = x.message
  }
}
async function logout() {
  if (session) await fetch(URL + "/auth/v1/logout", {
    method: "POST",
    headers: headers()
  }).catch(() => {});
  localStorage.removeItem(SK);
  location.reload()
}
async function start() {
  gate.classList.add("hidden");
  try {
    await load();
    document.querySelector(".bottom-nav").classList.toggle("hidden", !access());
    if (new URLSearchParams(location.search).get("checkout") === "success") {
      app.innerHTML = '<div class="instruction"><h3>Pagamento recebido</h3><p>Estamos a confirmar o teu acesso. A página atualizará dentro de instantes.</p></div>';
      setTimeout(() => location.href = location.origin, 4000)
    } else render("home")
  } catch (x) {
    app.innerHTML = `<div class="instruction"><h3>Não foi possível carregar a conta</h3><p>${x.message}</p></div>`
  }
}
document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => render(b.dataset.view));
(async () => {
  if (await oauthRedirect()) return start();
  session?.access_token ? start() : gate.classList.remove("hidden")
})();
