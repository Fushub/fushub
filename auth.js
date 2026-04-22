/* ══════════════════════════════════════════════════════════════
   FUSHUB — auth.js (versão Supabase)
   ══════════════════════════════════════════════════════════════ */

/* ── Configuração do Supabase ─────────────────────────────── */
const SUPABASE_URL  = 'https://gyutskbeadrwlrmewjiw.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5dXRza2JlYWRyd2xybWV3aml3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MTM5OTcsImV4cCI6MjA5MjI4OTk5N30.cPl1p-PhL4Jpc31hWTNN2aHTR9qcgYOPUOahfkqDmEc';

/* Carrega o SDK do Supabase via CDN */
(function loadSupabase() {
  if (window.supabase) return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload = () => {
    window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.dispatchEvent(new Event('supabase:ready'));
  };
  document.head.appendChild(s);
})();

function getSupabase() {
  return window._supabaseClient;
}

/* ══════════════════════════════════════════════════════════════
   TEMA — modo escuro / claro
   ══════════════════════════════════════════════════════════════ */
const TEMA_KEY = 'fushub_tema';

function getTema() {
  return localStorage.getItem(TEMA_KEY) || 'light';
}

function aplicarTema(tema) {
  if (tema === 'dark') {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
}

function salvarTema(tema) {
  localStorage.setItem(TEMA_KEY, tema);
  aplicarTema(tema);
}

(function() {
  const s = document.currentScript || document.querySelector('script[src*="auth.js"]');
  if (!s || !s.hasAttribute('data-no-tema')) {
    aplicarTema(getTema());
  }
})();

/* ══════════════════════════════════════════════════════════════
   AUTENTICAÇÃO
   ══════════════════════════════════════════════════════════════ */

async function registrar(dados) {
  const sb = getSupabase();
  if (!sb) return { ok: false, erro: 'Sistema não iniciado. Tente novamente.' };

  const { data, error } = await sb.auth.signUp({
    email: dados.email.trim().toLowerCase(),
    password: dados.senha,
    options: {
      data: {
        nome:      dados.nome.trim(),
        sobrenome: dados.sobrenome.trim(),
      }
    }
  });

  if (error) return { ok: false, erro: traduzirErro(error.message) };

  /* Cria o perfil na tabela pública */
  if (data.user) {
    await sb.from('perfis').insert({
      id:        data.user.id,
      nome:      dados.nome.trim(),
      sobrenome: dados.sobrenome.trim(),
      telefone:  dados.telefone || '',
      faculdade: dados.faculdade || '',
      anfitriao: false,
    });
  }

  return { ok: true };
}

async function entrar(email, senha) {
  const sb = getSupabase();
  if (!sb) return { ok: false, erro: 'Sistema não iniciado. Tente novamente.' };

  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  });

  if (error) return { ok: false, erro: traduzirErro(error.message) };
  return { ok: true, user: data.user };
}

async function logout() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
  window.location.replace('index.html');
}

async function getUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: perfil } = await sb.from('perfis').select('*').eq('id', user.id).single();
  return perfil ? { ...user, ...perfil } : user;
}

async function isLogado() {
  const sb = getSupabase();
  if (!sb) return false;
  const { data: { session } } = await sb.auth.getSession();
  return !!session;
}

async function isAnfitriao() {
  const sb = getSupabase();
  if (!sb) return false;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { data } = await sb.from('perfis').select('anfitriao').eq('id', user.id).single();
  return data?.anfitriao === true;
}

/* ══════════════════════════════════════════════════════════════
   IMÓVEIS
   ══════════════════════════════════════════════════════════════ */

async function getTodosImoveis() {
  const sb = getSupabase();
  const { data, error } = await sb.from('imoveis').select('*, perfis(nome, sobrenome, avatar_url)').eq('ativo', true).order('criado_em', { ascending: false });
  if (error) { console.error('Erro ao buscar imóveis:', error); return []; }
  return data || [];
}

async function getImoveis() {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data, error } = await sb.from('imoveis').select('*').eq('dono_id', user.id).order('criado_em', { ascending: false });
  if (error) return [];
  return data || [];
}

async function salvarImovel(imovel) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, erro: 'Você precisa estar logado.' };

  const dadosImovel = {
    dono_id:     user.id,
    titulo:      imovel.titulo,
    descricao:   imovel.descricao || '',
    tipo:        imovel.tipo || '',
    preco:       imovel.preco || 0,
    cidade:      imovel.cidade || '',
    bairro:      imovel.bairro || '',
    endereco:    imovel.endereco || '',
    area:        imovel.area || null,
    capacidade:  imovel.capacidade || null,
    mobiliado:   imovel.mobiliado || false,
    aceita_pets: imovel.aceitaPets || false,
    comodidades: imovel.comodidades || [],
    ativo:       true,
  };

  let result;
  if (imovel.id) {
    result = await sb.from('imoveis').update(dadosImovel).eq('id', imovel.id).eq('dono_id', user.id).select().single();
  } else {
    result = await sb.from('imoveis').insert(dadosImovel).select().single();
  }

  if (result.error) return { ok: false, erro: result.error.message };

  /* Marca usuário como anfitrião */
  await sb.from('perfis').update({ anfitriao: true }).eq('id', user.id);

  return { ok: true, imovel: result.data };
}

async function removerImovel(id) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };
  await sb.from('imoveis').delete().eq('id', id).eq('dono_id', user.id);
  return { ok: true };
}

/* ══════════════════════════════════════════════════════════════
   FAVORITOS
   ══════════════════════════════════════════════════════════════ */

async function getFavoritos() {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data } = await sb.from('favoritos').select('imovel_id').eq('usuario_id', user.id);
  return (data || []).map(f => f.imovel_id);
}

async function toggleFavorito(imovelId) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };

  const { data: existente } = await sb.from('favoritos').select('id').eq('usuario_id', user.id).eq('imovel_id', imovelId).single();

  if (existente) {
    await sb.from('favoritos').delete().eq('id', existente.id);
    return { ok: true, favoritado: false };
  } else {
    await sb.from('favoritos').insert({ usuario_id: user.id, imovel_id: imovelId });
    return { ok: true, favoritado: true };
  }
}

/* ══════════════════════════════════════════════════════════════
   MENSAGENS (com Realtime)
   ══════════════════════════════════════════════════════════════ */

async function enviarMensagem(destinatarioId, texto, imovelId) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await sb.from('mensagens').insert({
    remetente_id:    user.id,
    destinatario_id: destinatarioId,
    imovel_id:       imovelId || null,
    texto,
  });

  return error ? { ok: false, erro: error.message } : { ok: true };
}

async function getConversa(outroUsuarioId) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  const { data } = await sb.from('mensagens')
    .select('*')
    .or(`and(remetente_id.eq.${user.id},destinatario_id.eq.${outroUsuarioId}),and(remetente_id.eq.${outroUsuarioId},destinatario_id.eq.${user.id})`)
    .order('criado_em', { ascending: true });

  return data || [];
}

function ouvirMensagens(callback) {
  const sb = getSupabase();
  const canal = sb.channel('mensagens-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens' }, callback)
    .subscribe();
  return canal; /* guarde para poder cancelar: canal.unsubscribe() */
}

/* ══════════════════════════════════════════════════════════════
   PERFIL
   ══════════════════════════════════════════════════════════════ */

async function atualizarPerfil(dados) {
  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, erro: 'Você precisa estar logado.' };

  const { error } = await sb.from('perfis').update({
    nome:      dados.nome?.trim(),
    sobrenome: dados.sobrenome?.trim(),
    telefone:  dados.tel?.trim(),
    faculdade: dados.univ?.trim(),
    curso:     dados.curso?.trim(),
    bio:       dados.bio?.trim(),
    cidade:    dados.cidade?.trim(),
    atualizado_em: new Date().toISOString(),
  }).eq('id', user.id);

  return error ? { ok: false, erro: error.message } : { ok: true };
}

async function alterarSenha(senhaAtual, novaSenha, confirmaSenha) {
  if (!novaSenha || novaSenha.length < 6) return { ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' };
  if (novaSenha !== confirmaSenha) return { ok: false, erro: 'As senhas não coincidem.' };

  const sb = getSupabase();
  const { error } = await sb.auth.updateUser({ password: novaSenha });
  return error ? { ok: false, erro: traduzirErro(error.message) } : { ok: true };
}

async function getInitials() {
  const user = await getUser();
  const nome  = (user?.nome  || '')[0] || 'U';
  const sobre = (user?.sobrenome || '')[0] || '';
  return (nome + sobre).toUpperCase();
}

/* ══════════════════════════════════════════════════════════════
   PROTEÇÃO DE ROTA
   ══════════════════════════════════════════════════════════════ */

(async function protegerRota() {
  const script   = document.currentScript;
  const isPublic = script && script.hasAttribute('data-public');

  /* Aguarda o Supabase estar pronto */
  async function esperarSupabase() {
    if (window._supabaseClient) return;
    return new Promise(resolve => window.addEventListener('supabase:ready', resolve, { once: true }));
  }

  await esperarSupabase();

  const sb = getSupabase();
  const { data: { session } } = await sb.auth.getSession();
  const logado = !!session;

  if (isPublic && logado) {
    window.location.replace('plataforma.html');
  } else if (!isPublic && !logado) {
    const tentativa = window.location.pathname.split('/').pop() + window.location.search;
    sessionStorage.setItem('fushub_redirect', tentativa);
    window.location.replace('entrar.html');
  }

  /* Preenche avatares após verificação */
  if (logado) {
    document.addEventListener('DOMContentLoaded', async () => {
      const user = await getUser();
      const initials = getInitials_sync(user);
      document.querySelectorAll('.nav-avatar, #navAvatar, #bigAvatar').forEach(el => {
        if (el.dataset.skip) return;
        if (user?.avatar_url) {
          el.innerHTML = `<img src="${user.avatar_url}" alt="${initials}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
          el.style.background = 'transparent';
        } else {
          el.textContent = initials;
        }
      });

      /* Injeta tab anfitrião se for anfitrião */
      if (user?.anfitriao) {
        const navTabs = document.querySelector('.nav-tabs, .nav-tabs-wrap');
        if (navTabs && !document.getElementById('tabAnfitriao')) {
          const tab = document.createElement('a');
          tab.id = 'tabAnfitriao';
          tab.className = 'nav-tab' + (window.location.pathname.endsWith('painel.html') ? ' active' : '');
          tab.href = 'painel.html';
          tab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span>Painel do Anfitrião</span>';
          navTabs.appendChild(tab);
        }
      }
    });
  }
})();

/* ══════════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════════ */

function getInitials_sync(user) {
  const nome  = (user?.nome  || '')[0] || 'U';
  const sobre = (user?.sobrenome || '')[0] || '';
  return (nome + sobre).toUpperCase();
}

function traduzirErro(msg) {
  if (!msg) return 'Erro desconhecido.';
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email already registered') || msg.includes('already been registered')) return 'Este e-mail já está cadastrado.';
  if (msg.includes('Password should be at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (msg.includes('Unable to validate email')) return 'E-mail inválido.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  return msg;
}

/* ── API pública ──────────────────────────────────────────── */
window.FushubAuth = {
  getUser,
  getInitials,
  logout,
  isLogado,
  isAnfitriao,
  registrar,
  entrar,
  /* imóveis */
  getImoveis,
  getTodosImoveis,
  salvarImovel,
  removerImovel,
  /* favoritos */
  getFavoritos,
  toggleFavorito,
  /* mensagens */
  enviarMensagem,
  getConversa,
  ouvirMensagens,
  /* conta */
  alterarSenha,
  atualizarPerfil,
  /* tema */
  getTema,
  salvarTema,
  aplicarTema,
  /* supabase direto (para casos específicos) */
  getSupabase,
};
