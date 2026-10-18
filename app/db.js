// Camada de dados do painel.
//
// O app.js fala sempre com a mesma interface, parecida com a do Firestore:
//   db.collection('pecas').add({...})
//   db.collection('pecas').doc(id).update({...}) / .delete()
//   db.collection('clientes').orderBy('nome').onSnapshot(cb, erro)
// Aqui escolhemos onde os dados moram: no navegador (teste) ou no Firebase.

import { FIREBASE_CONFIG, EMAIL_DONO } from './config.js';

export async function abrirBanco() {
  return FIREBASE_CONFIG ? bancoFirebase() : bancoLocal();
}

// ---------- Modo local (localStorage) ----------
function bancoLocal() {
  const ouvintes = {};
  const chave = (col) => 'painel:' + col;
  const ler = (col) => { try { return JSON.parse(localStorage.getItem(chave(col))) || {}; } catch (e) { return {}; } };
  const gravar = (col, dados) => {
    localStorage.setItem(chave(col), JSON.stringify(dados));
    (ouvintes[col] || []).forEach((f) => f());
  };
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function consulta(col, ordem = null, max = null) {
    return {
      orderBy: (campo, dir = 'asc') => consulta(col, { campo, dir }, max),
      limit: (n) => consulta(col, ordem, n),
      onSnapshot(cb) {
        const emitir = () => {
          let docs = Object.entries(ler(col)).map(([id, d]) => ({ id, data: () => d }));
          if (ordem) {
            const s = ordem.dir === 'desc' ? -1 : 1;
            docs.sort((a, b) => String(a.data()[ordem.campo] ?? '').localeCompare(String(b.data()[ordem.campo] ?? ''), 'pt-BR') * s);
          }
          if (max) docs = docs.slice(0, max);
          cb({ docs });
        };
        (ouvintes[col] ||= []).push(emitir);
        emitir();
        return () => { ouvintes[col] = ouvintes[col].filter((f) => f !== emitir); };
      },
    };
  }

  return {
    collection(col) {
      return {
        ...consulta(col),
        async add(dados) { const id = novoId(); gravar(col, { ...ler(col), [id]: dados }); return { id }; },
        doc(id) {
          return {
            async update(patch) { const t = ler(col); if (!t[id]) throw new Error('Documento não existe'); t[id] = { ...t[id], ...patch }; gravar(col, t); },
            async set(dados) { gravar(col, { ...ler(col), [id]: dados }); },
            async delete() { const t = ler(col); delete t[id]; gravar(col, t); },
          };
        },
      };
    },
  };
}

// ---------- Modo Firebase (Firestore + login Google) ----------
const V = '10.12.2';
async function bancoFirebase() {
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);

  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const fs = F.getFirestore(app);

  await exigirLogin(A, auth);

  function consulta(col, restricoes = []) {
    return {
      orderBy: (campo, dir = 'asc') => consulta(col, [...restricoes, F.orderBy(campo, dir)]),
      limit: (n) => consulta(col, [...restricoes, F.limit(n)]),
      onSnapshot: (cb, erro) => F.onSnapshot(F.query(F.collection(fs, col), ...restricoes), cb, erro),
    };
  }

  return {
    collection(col) {
      return {
        ...consulta(col),
        add: (dados) => F.addDoc(F.collection(fs, col), dados),
        doc: (id) => ({
          update: (patch) => F.updateDoc(F.doc(fs, col, id), patch),
          set: (dados) => F.setDoc(F.doc(fs, col, id), dados),
          delete: () => F.deleteDoc(F.doc(fs, col, id)),
        }),
      };
    },
  };
}

// Mostra o botão "Entrar com Google" e só continua quando o dono estiver logado.
function exigirLogin(A, auth) {
  const box = document.getElementById('login');
  return new Promise((resolve) => {
    A.onAuthStateChanged(auth, (user) => {
      if (user && user.email === EMAIL_DONO) {
        box.hidden = true;
        resolve(user);
        return;
      }
      box.hidden = false;
      box.innerHTML = user
        ? `<span>A conta ${user.email} não tem acesso a este painel.</span><button class="btn" id="sair">Trocar de conta</button>`
        : `<span>Entre para ver suas peças.</span><button class="btn primary" id="entrar">Entrar com Google</button>`;
      document.getElementById('list').innerHTML = '';
      const entrar = document.getElementById('entrar');
      const sair = document.getElementById('sair');
      if (entrar) entrar.onclick = () => A.signInWithPopup(auth, new A.GoogleAuthProvider());
      if (sair) sair.onclick = () => A.signOut(auth);
    });
  });
}
