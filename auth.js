/* ══════════════════════════════════════════════════════════════
   FUSHUB — auth.js
   Sistema central de autenticação e sessão.

   Uso em páginas PROTEGIDAS (painel, plataforma, etc.):
     <script src="auth.js"></script>
     → Redireciona automaticamente para entrar.html se não logado.

   Uso em páginas PÚBLICAS (entrar, cadastro):
     <script src="auth.js" data-public></script>
     → Redireciona para plataforma.html se JÁ estiver logado.

   API global exposta:
     FushubAuth.getUser()               → objeto com dados do usuário logado ou null
     FushubAuth.getInitials()           → string "AB" para o avatar
     FushubAuth.logout()                → limpa sessão e redireciona
     FushubAuth.isAnfitriao()           → boolean
     FushubAuth.registrar(dados)        → { ok, erro } — cria conta nova
     FushubAuth.entrar(email, senha)    → { ok, erro } — autentica usuário
     FushubAuth.emailExiste(email)      → boolean
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Chaves de armazenamento ──────────────────────────────── */
  var KEYS = {
    logado:     'fushub_logado',
    usuarios:   'fushub_usuarios',   // lista de contas cadastradas
    sessaoId:   'fushub_sessao_id',  // email do usuário logado na sessão
    cadastro:   'fushub_cadastro',   // dados públicos do usuário logado
    perfil:     'fushub_perfil',     // edições de perfil do usuário logado
    initials:   'fushub_initials',
    anfitriao:  'fushub_anfitriao',
    imoveis:    'fushub_imoveis',
    favs:       'fushub_favs',
  };

  /* ══════════════════════════════════════════════════════════
     HASH DE SENHA — djb2 (leve, sem dependências externas)
     Nota: em produção com backend real, use bcrypt no servidor.
     Aqui protege contra "ver a senha no localStorage" sem
     precisar de crypto assíncrono ou bibliotecas externas.
  ══════════════════════════════════════════════════════════ */
  function hashSenha(senha) {
    var hash = 5381;
    for (var i = 0; i < senha.length; i++) {
      hash = ((hash << 5) + hash) ^ senha.charCodeAt(i);
      hash = hash >>> 0; // mantém 32-bit unsigned
    }
    // Adiciona um salt fixo baseado no próprio texto para dificultar tabelas rainbow
    var salt = 'fushub_';
    for (var j = 0; j < salt.length; j++) {
      hash = ((hash << 5) + hash) ^ salt.charCodeAt(j);
      hash = hash >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  /* ══════════════════════════════════════════════════════════
     BANCO DE USUÁRIOS (localStorage)
     Estrutura: [{ email, senhaHash, nome, sobrenome, telefone,
                   faculdade, criadoEm, anfitriao }]
  ══════════════════════════════════════════════════════════ */
  function listarUsuarios() {
    try { return JSON.parse(localStorage.getItem(KEYS.usuarios) || '[]'); }
    catch (e) { return []; }
  }

  function salvarUsuarios(lista) {
    localStorage.setItem(KEYS.usuarios, JSON.stringify(lista));
  }

  function buscarPorEmail(email) {
    var lista = listarUsuarios();
    var lower = email.trim().toLowerCase();
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].email.toLowerCase() === lower) return lista[i];
    }
    return null;
  }

  function emailExiste(email) {
    return buscarPorEmail(email) !== null;
  }

  /* ── Cria conta nova ──────────────────────────────────────── */
  function registrar(dados) {
    // dados: { nome, sobrenome, telefone, email, senha, faculdade }
    if (!dados.email || !dados.senha) {
      return { ok: false, erro: 'Preencha todos os campos obrigatórios.' };
    }
    if (emailExiste(dados.email)) {
      return { ok: false, erro: 'Este e-mail já está cadastrado. Que tal entrar?' };
    }
    if (dados.senha.length < 6) {
      return { ok: false, erro: 'A senha precisa ter pelo menos 6 caracteres.' };
    }

    var novoUsuario = {
      email:      dados.email.trim().toLowerCase(),
      senhaHash:  hashSenha(dados.senha),
      nome:       dados.nome.trim(),
      sobrenome:  dados.sobrenome.trim(),
      telefone:   dados.telefone ? dados.telefone.trim() : '',
      faculdade:  dados.faculdade ? dados.faculdade.trim() : '',
      anfitriao:  false,
      criadoEm:   new Date().toISOString(),
    };

    var lista = listarUsuarios();
    lista.push(novoUsuario);
    salvarUsuarios(lista);

    /* Cria perfil público inicial com nome e faculdade */
    var chavePublica = 'fushub_perfil_publico_' + novoUsuario.email;
    var perfilPublicoInicial = {
      nome:        novoUsuario.nome,
      sobrenome:   novoUsuario.sobrenome,
      bio:         '',
      cidade:      '',
      faculdade:   novoUsuario.faculdade || '',
      curso:       '',
      periodo:     '',
      interesses:  [],
      avatarUrl:   null,
      atualizadoEm: new Date().toISOString(),
    };
    localStorage.setItem(chavePublica, JSON.stringify(perfilPublicoInicial));

    // Inicia sessão automaticamente após cadastro
    _iniciarSessao(novoUsuario);
    return { ok: true };
  }

  /* ── Autentica usuário existente ──────────────────────────── */
  function entrar(email, senha) {
    if (!email || !senha) {
      return { ok: false, erro: 'Preencha e-mail e senha.' };
    }
    var usuario = buscarPorEmail(email);
    if (!usuario) {
      return { ok: false, erro: 'E-mail não encontrado. Verifique ou crie uma conta.' };
    }
    if (usuario.senhaHash !== hashSenha(senha)) {
      return { ok: false, erro: 'Senha incorreta. Tente novamente.' };
    }
    _iniciarSessao(usuario);
    return { ok: true };
  }

  /* ── Inicia sessão (uso interno) ──────────────────────────── */
  function _iniciarSessao(usuario) {
    sessionStorage.setItem(KEYS.logado,   '1');
    sessionStorage.setItem(KEYS.sessaoId, usuario.email);

    // Popula chave 'cadastro' com dados públicos (sem hash de senha)
    var dadosPublicos = {
      email:     usuario.email,
      nome:      usuario.nome,
      sobrenome: usuario.sobrenome,
      telefone:  usuario.telefone,
      faculdade: usuario.faculdade,
    };
    localStorage.setItem(KEYS.cadastro, JSON.stringify(dadosPublicos));

    // Atualiza flag de anfitrião
    if (usuario.anfitriao) {
      localStorage.setItem(KEYS.anfitriao, '1');
    } else {
      localStorage.removeItem(KEYS.anfitriao);
    }
  }

  /* ── Verificação de sessão ────────────────────────────────── */
  function isLogado() {
    return sessionStorage.getItem(KEYS.logado) === '1';
  }

  /* ── Dados do usuário logado (merge de cadastro + perfil editado) ── */
  function getUser() {
    if (!isLogado()) return null;
    try {
      var emailSessao = sessionStorage.getItem(KEYS.sessaoId);
      // Se tiver email na sessão, puxa direto do banco de usuários
      if (emailSessao) {
        var usuario = buscarPorEmail(emailSessao);
        if (usuario) {
          var perfilEditado = {};
          try { perfilEditado = JSON.parse(localStorage.getItem(KEYS.perfil) || '{}'); } catch(e) {}
          // Nunca expõe o hash de senha
          var base = {
            email:     usuario.email,
            nome:      usuario.nome,
            sobrenome: usuario.sobrenome,
            telefone:  usuario.telefone,
            faculdade: usuario.faculdade,
            anfitriao: usuario.anfitriao,
          };
          return Object.assign({}, base, perfilEditado);
        }
      }
      // Fallback: lê do cadastro salvo (compatibilidade)
      var cadastro = JSON.parse(localStorage.getItem(KEYS.cadastro) || '{}');
      var perfil   = JSON.parse(localStorage.getItem(KEYS.perfil)   || '{}');
      return Object.assign({}, cadastro, perfil);
    } catch (e) {
      return {};
    }
  }

  /* ── Iniciais para o avatar ───────────────────────────────── */
  function getInitials() {
    var user  = getUser();
    var nome  = (user && (user.nome  || ''))[0] || 'U';
    var sobre = (user && (user.sobrenome || ''))[0] || '';
    return (nome + sobre).toUpperCase();
  }

  /* ── Logout ───────────────────────────────────────────────── */
  function logout() {
    sessionStorage.removeItem(KEYS.logado);
    sessionStorage.removeItem(KEYS.sessaoId);
    sessionStorage.removeItem('fushub_redirect');
    window.location.replace('index.html');
  }

  /* ── Valida redirect (previne open redirect externo) ─────── */
  function sanitizeRedirect(url) {
    if (!url) return 'plataforma.html';
    // Rejeita URLs absolutas (http://, https://, //, etc.)
    if (/^(https?:)?\/\//i.test(url)) return 'plataforma.html';
    // Rejeita caminhos que saem do diretório atual
    if (url.indexOf('..') !== -1) return 'plataforma.html';
    return url;
  }

  /* ══════════════════════════════════════════════════════════
     IMÓVEIS — armazenamento por usuário
     Chave: fushub_imoveis_<email_hash>
     Assim dois usuários no mesmo browser não se misturam.
  ══════════════════════════════════════════════════════════ */
  function _chaveImoveis(email) {
    return 'fushub_imoveis_' + hashSenha(email || 'guest');
  }

  function getImoveis() {
    /* Retorna imóveis do usuário logado */
    var sessao = sessionStorage.getItem(KEYS.sessaoId);
    if (!sessao) {
      /* Fallback: chave genérica (retrocompatibilidade) */
      try { return JSON.parse(localStorage.getItem(KEYS.imoveis) || '[]'); } catch(e) { return []; }
    }
    try { return JSON.parse(localStorage.getItem(_chaveImoveis(sessao)) || '[]'); } catch(e) { return []; }
  }

  /* ── Chaves separadas para fotos (evita estourar o limite do localStorage) ── */
  function _chaveFotoCapa(id)    { return 'fushub_foto_capa_'   + String(id); }
  function _chaveFotosExtras(id) { return 'fushub_foto_extras_' + String(id); }

  /* Injeta as fotos de volta num imóvel antes de retorná-lo */
  function _injetarFotos(im) {
    var id = String(im.id);
    var capa   = localStorage.getItem(_chaveFotoCapa(id));
    var extras = localStorage.getItem(_chaveFotosExtras(id));
    if (capa)   im.imgCustom   = capa;
    if (extras) { try { im.fotosExtras = JSON.parse(extras); } catch(e) {} }
    return im;
  }

  function salvarImovel(imovel) {
    /* Salva/atualiza um imóvel do usuário logado.
       As imagens base64 ficam em chaves SEPARADAS para não estourar
       o limite do localStorage ao salvar a lista de imóveis. */
    var sessao = sessionStorage.getItem(KEYS.sessaoId);
    var chave  = sessao ? _chaveImoveis(sessao) : KEYS.imoveis;
    var lista  = getImoveis();

    /* Associa o email do dono ao imóvel */
    imovel.donoEmail = sessao || '';

    /* Salva fotos em chaves independentes e remove do objeto principal */
    var id = String(imovel.id);
    if (imovel.imgCustom) {
      try { localStorage.setItem(_chaveFotoCapa(id), imovel.imgCustom); } catch(e) {}
      delete imovel.imgCustom;
    }
    if (imovel.fotosExtras && imovel.fotosExtras.length > 0) {
      try { localStorage.setItem(_chaveFotosExtras(id), JSON.stringify(imovel.fotosExtras)); } catch(e) {}
      delete imovel.fotosExtras;
    }

    var idx = lista.findIndex(function(im) { return im.id === imovel.id; });
    if (idx >= 0) {
      lista[idx] = imovel;
    } else {
      lista.push(imovel);
    }

    try {
      localStorage.setItem(chave, JSON.stringify(lista));
    } catch (e) {
      console.error('Fushub: erro ao salvar imóvel', e);
    }

    /* Marca usuário como anfitrião */
    var emailSessao = sessionStorage.getItem(KEYS.sessaoId);
    if (emailSessao) {
      var usuarios = listarUsuarios();
      var u = usuarios.find(function(x) { return x.email === emailSessao; });
      if (u) { u.anfitriao = true; salvarUsuarios(usuarios); }
    }
    localStorage.setItem(KEYS.anfitriao, '1');

    return { ok: true };
  }

  function removerImovel(id) {
    var sessao = sessionStorage.getItem(KEYS.sessaoId);
    var chave  = sessao ? _chaveImoveis(sessao) : KEYS.imoveis;
    var lista  = getImoveis().filter(function(im) { return im.id !== id; });
    localStorage.setItem(chave, JSON.stringify(lista));
    /* Remove as fotos da chave separada também */
    localStorage.removeItem(_chaveFotoCapa(id));
    localStorage.removeItem(_chaveFotosExtras(id));
    /* NÃO altera o status de anfitrião ao deletar imóvel.
       O usuário só deixa de ser anfitrião pela ação explícita deixarDeSerAnfitriao(). */
  }

  /* ── Deixar de ser anfitrião (ação explícita do usuário) ─── */
  function deixarDeSerAnfitriao() {
    var emailSessao = sessionStorage.getItem(KEYS.sessaoId);
    if (!emailSessao) return { ok: false, erro: 'Você precisa estar logado.' };

    /* Remove todos os imóveis do usuário */
    var chave = _chaveImoveis(emailSessao);
    localStorage.removeItem(chave);
    localStorage.removeItem(KEYS.imoveis); /* legado */

    /* Atualiza banco de usuários */
    var usuarios = listarUsuarios();
    var u = usuarios.find(function(x) { return x.email === emailSessao; });
    if (u) { u.anfitriao = false; salvarUsuarios(usuarios); }

    /* Remove flag rápida */
    localStorage.removeItem(KEYS.anfitriao);

    return { ok: true };
  }

  /* Todos os imóveis de todos os usuários (para a plataforma pública) */
  function getTodosImoveis() {
    var todos = [];
    try {
      var keys = Object.keys(localStorage);
      keys.forEach(function(k) {
        if (k.startsWith('fushub_imoveis_')) {
          var lista = JSON.parse(localStorage.getItem(k) || '[]');
          todos = todos.concat(lista);
        }
      });
      /* Fallback: chave genérica antiga */
      var generica = JSON.parse(localStorage.getItem(KEYS.imoveis) || '[]');
      generica.forEach(function(im) {
        if (!todos.find(function(x) { return x.id === im.id; })) todos.push(im);
      });
    } catch(e) {}
    /* Injeta fotos salvas nas chaves separadas */
    return todos.map(_injetarFotos);
  }

  /* ── Altera senha do usuário logado ──────────────────────── */
  function alterarSenha(senhaAtual, novaSenha, confirmaSenha) {
    var emailSessao = sessionStorage.getItem(KEYS.sessaoId);
    if (!emailSessao) return { ok: false, erro: 'Você precisa estar logado.' };

    if (!senhaAtual || !novaSenha || !confirmaSenha) {
      return { ok: false, erro: 'Preencha todos os campos de senha.' };
    }
    if (novaSenha.length < 6) {
      return { ok: false, erro: 'A nova senha precisa ter pelo menos 6 caracteres.' };
    }
    if (novaSenha !== confirmaSenha) {
      return { ok: false, erro: 'A confirmação não corresponde à nova senha.' };
    }

    var usuarios = listarUsuarios();
    var idx = -1;
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === emailSessao) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, erro: 'Usuário não encontrado.' };

    if (usuarios[idx].senhaHash !== hashSenha(senhaAtual)) {
      return { ok: false, erro: 'Senha atual incorreta.' };
    }

    usuarios[idx].senhaHash = hashSenha(novaSenha);
    salvarUsuarios(usuarios);
    return { ok: true };
  }

  /* ── Atualiza dados do perfil do usuário logado ───────────── */
  function atualizarPerfil(dados) {
    var emailSessao = sessionStorage.getItem(KEYS.sessaoId);
    if (!emailSessao) return { ok: false, erro: 'Você precisa estar logado.' };

    if (!dados.nome || !dados.nome.trim()) {
      return { ok: false, erro: 'O nome não pode ficar em branco.' };
    }

    var usuarios = listarUsuarios();
    var idx = -1;
    for (var i = 0; i < usuarios.length; i++) {
      if (usuarios[i].email === emailSessao) { idx = i; break; }
    }
    if (idx < 0) return { ok: false, erro: 'Usuário não encontrado.' };

    usuarios[idx].nome      = dados.nome.trim();
    usuarios[idx].sobrenome = (dados.sobrenome || '').trim();
    usuarios[idx].telefone  = (dados.tel || '').trim();
    usuarios[idx].faculdade = (dados.univ || '').trim();
    if (dados.curso !== undefined) usuarios[idx].curso = dados.curso.trim();
    salvarUsuarios(usuarios);

    var perfilAtual = {};
    try { perfilAtual = JSON.parse(localStorage.getItem(KEYS.perfil) || '{}'); } catch(e) {}
    var perfilNovo = Object.assign({}, perfilAtual, {
      nome:      usuarios[idx].nome,
      sobrenome: usuarios[idx].sobrenome,
      tel:       usuarios[idx].telefone,
      univ:      usuarios[idx].faculdade,
      curso:     usuarios[idx].curso || '',
    });
    localStorage.setItem(KEYS.perfil, JSON.stringify(perfilNovo));

    var dadosPublicos = {
      email:     usuarios[idx].email,
      nome:      usuarios[idx].nome,
      sobrenome: usuarios[idx].sobrenome,
      telefone:  usuarios[idx].telefone,
      faculdade: usuarios[idx].faculdade,
    };
    localStorage.setItem(KEYS.cadastro, JSON.stringify(dadosPublicos));
    return { ok: true };
  }

  /* ── É anfitrião? ─────────────────────────────────────────── */
  function isAnfitriao() {
    /* Fonte da verdade: banco de usuários (localStorage permanente) */
    var emailSessao = sessionStorage.getItem(KEYS.sessaoId);
    if (emailSessao) {
      var usuario = buscarPorEmail(emailSessao);
      if (usuario) {
        /* Sincroniza a flag rápida com o banco */
        if (usuario.anfitriao) {
          localStorage.setItem(KEYS.anfitriao, '1');
        } else {
          localStorage.removeItem(KEYS.anfitriao);
        }
        return !!usuario.anfitriao;
      }
    }
    /* Fallback: flag rápida (compatibilidade) */
    return localStorage.getItem(KEYS.anfitriao) === '1';
  }

  /* ── Injeta aba "Painel do Anfitrião" na navbar dinamicamente ─ */
  function injetaTabAnfitriao() {
    if (!isAnfitriao()) return;

    /* Funciona em qualquer página que tenha .nav-tabs ou .nav-tabs-wrap */
    var navTabs = document.querySelector('.nav-tabs, .nav-tabs-wrap');
    if (!navTabs) return;

    /* Não duplica se já existir */
    if (document.getElementById('tabAnfitriao')) return;

    var tab = document.createElement('a');
    tab.id        = 'tabAnfitriao';
    tab.className = 'nav-tab';
    tab.href      = 'painel.html';

    /* Marca como ativa se estivermos no painel */
    if (window.location.pathname.endsWith('painel.html')) {
      tab.className += ' active';
    }

    tab.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>' +
        '<rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' +
      '</svg>' +
      '<span>Painel do Anfitrião</span>';

    navTabs.appendChild(tab);

    /* Esconde o item "Tornar-se anfitrião" do dropdown (já é anfitrião) */
    var linkAnf = document.getElementById('linkAnfitriao');
    if (linkAnf) {
      /* Esconde o item e o divisor acima dele se tiver */
      linkAnf.style.display = 'none';
      var prev = linkAnf.previousElementSibling;
      if (prev && prev.classList.contains('dropdown-divider')) {
        prev.style.display = 'none';
      }
    }
  }

  function preencheAvatares() {
    var initials = getInitials();
    var avatarUrl = '';

    // Busca foto de perfil do usuário logado
    try {
      var emailSessao = sessionStorage.getItem(KEYS.sessaoId);
      if (emailSessao) {
        var pub = JSON.parse(localStorage.getItem('fushub_perfil_publico_' + emailSessao.toLowerCase()) || 'null');
        if (pub && pub.avatarUrl) avatarUrl = pub.avatarUrl;
      }
    } catch(e) {}

    document.querySelectorAll('.nav-avatar, #navAvatar, #bigAvatar').forEach(function (el) {
      if (el.dataset.skip) return;
      if (avatarUrl) {
        el.innerHTML = '<img src="' + avatarUrl + '" alt="' + initials + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
        el.style.background = 'transparent';
      } else {
        el.textContent = initials;
        el.style.background = '';
      }
    });
  }

  /* ── Proteção de rota ─────────────────────────────────────── */
  var script = document.currentScript;
  var isPublic = script && script.hasAttribute('data-public');

  if (isPublic) {
    /* Página pública: redireciona para plataforma se já logado */
    if (isLogado()) {
      window.location.replace('plataforma.html');
    }
  } else {
    /* Página protegida: redireciona para login se não logado */
    if (!isLogado()) {
      /* Salva a URL que o usuário tentou acessar (apenas pathname relativo) */
      var tentativa = window.location.pathname.split('/').pop() + window.location.search;
      sessionStorage.setItem('fushub_redirect', sanitizeRedirect(tentativa));
      window.location.replace('entrar.html');
    }
  }

  /* ── Preenche avatares quando o DOM estiver pronto ─────────── */
  function onDomReady() {
    preencheAvatares();
    injetaTabAnfitriao();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDomReady);
  } else {
    onDomReady();
  }

  /* ══════════════════════════════════════════════════════════
     TEMA — modo escuro / claro
     Salvo em localStorage como 'fushub_tema': 'dark' | 'light'
     Aplicado imediatamente em cada página para evitar flash.
  ══════════════════════════════════════════════════════════ */
  var TEMA_KEY = 'fushub_tema';

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

  /* Aplica o tema salvo imediatamente — mas NÃO em páginas com data-no-tema (ex: entrar, cadastro) */
  (function() {
    var s = document.currentScript || document.querySelector('script[src*="auth.js"]');
    if (!s || !s.hasAttribute('data-no-tema')) {
      aplicarTema(getTema());
    }
  })();

  /* ── API pública ──────────────────────────────────────────── */
  window.FushubAuth = {
    getUser:              getUser,
    getInitials:          getInitials,
    logout:               logout,
    isAnfitriao:          isAnfitriao,
    injetaTabAnfitriao:   injetaTabAnfitriao,
    isLogado:             isLogado,
    sanitizeRedirect:     sanitizeRedirect,
    registrar:            registrar,
    entrar:               entrar,
    emailExiste:          emailExiste,
    /* imóveis */
    getImoveis:           getImoveis,
    getTodosImoveis:      getTodosImoveis,
    salvarImovel:         salvarImovel,
    removerImovel:        removerImovel,
    /* conta */
    alterarSenha:         alterarSenha,
    atualizarPerfil:      atualizarPerfil,
    deixarDeSerAnfitriao: deixarDeSerAnfitriao,
    /* tema */
    getTema:              getTema,
    salvarTema:           salvarTema,
    aplicarTema:          aplicarTema,
    KEYS:                 KEYS,
  };

})();