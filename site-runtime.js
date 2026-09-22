(() => {
  'use strict';
  const cfg = window.LUNAVISUAL_CONFIG || {};
  const defaults = {
    launcher_url: cfg.launcherDefaultUrl || '',
    support_email: cfg.supportEmail || 'techbitsupport@gmail.com',
    telegram_url: cfg.telegramUrl || 'https://t.me/Luna_visual',
    discord_url: cfg.discordUrl || 'https://discord.gg/7FhVmvPtME',
    funpay_url: cfg.funpayUrl || 'https://funpay.com/users/17507792/',
    price_7: 270,
    price_30: 450,
    price_90: 670,
    price_lifetime: 1500,
    alpha_price: 2400,
    discount_enabled: false,
    discount_percent: 0,
    discount_label: 'Скидка',
    discount_until: null,
    key_system_enabled: false, alpha_enabled: false, models_enabled: true, creator_program_enabled: true, news_enabled: true, purchases_enabled: true,
    launcher_login_enabled: true, launcher_main_menu_enabled: true, launcher_cosmetics_enabled: true, launcher_social_enabled: true,
    key_system_message: 'Игра ещё не вышла в бету — она всё ещё разрабатывается. Ожидайте релиз ориентировочно с января по апрель или раньше.'
  };

  function activeDiscount(s) {
    if (!s.discount_enabled) return false;
    const p = Number(s.discount_percent || 0);
    if (!(p > 0 && p < 100)) return false;
    if (s.discount_until && new Date(s.discount_until).getTime() <= Date.now()) return false;
    return true;
  }

  function effectivePrice(base, s) {
    const n = Number(base || 0);
    if (!activeDiscount(s)) return n;
    return Math.max(0, Math.round(n * (100 - Number(s.discount_percent || 0)) / 100));
  }

  function rub(n) { return `${Number(n || 0).toLocaleString('ru-RU')} ₽`; }

  function safeHref(v, fallback) {
    const x = String(v || '').trim();
    if (!x) return ''; 
    if (/^https:\/\//i.test(x) || /^\.\.?\//.test(x) || /^[a-zA-Z0-9_.-]+(?:\?.*)?$/.test(x)) return x;
    return fallback;
  }

  function applySettings(raw) {
    const s = { ...defaults, ...(raw || {}) };
    s.launcher_url = safeHref(s.launcher_url, defaults.launcher_url);
    window.LUNAVISUAL_PUBLIC_SETTINGS = Object.freeze({ ...s });

    const priceMap = {
      d7: ['price_7', '7 Дней'],
      d30: ['price_30', '30 Дней'],
      d90: ['price_90', '90 Дней'],
      life: ['price_lifetime', 'Навсегда + Alpha 7 дней'],
      alpha: ['alpha_price', 'Alpha-доступ']
    };
    Object.entries(priceMap).forEach(([key, [field, planName]]) => {
      const base = Number(s[field] || 0), final = effectivePrice(base, s);
      document.querySelectorAll(`[data-plan-price="${key}"]`).forEach(el => {
        el.innerHTML = activeDiscount(s) && final !== base
          ? `<span class="lv-old-price">${rub(base)}</span> ${rub(final)}`
          : rub(base);
      });
      // Buy buttons use explicit data-plan-key so this also works in WebView/GitHub Pages.
      document.querySelectorAll(`[data-plan-key="${key}"]`).forEach(btn => { btn.dataset.price = rub(final); });
    });

    let badge = document.getElementById('siteDiscountBadge');
    if (!badge) {
      const pricingHead = document.querySelector('#pricing .section-header, #pricing .section-title')?.parentElement || document.querySelector('[data-i18n="price_title"]')?.parentElement;
      if (pricingHead) {
        badge = document.createElement('div');
        badge.id = 'siteDiscountBadge';
        badge.className = 'lv-discount-badge';
        pricingHead.appendChild(badge);
      }
    }
    if (badge) {
      if (activeDiscount(s)) {
        const until = s.discount_until ? ` · до ${new Date(s.discount_until).toLocaleString('ru-RU')}` : '';
        badge.textContent = `${s.discount_label || 'Скидка'} −${Number(s.discount_percent)}%${until}`;
        badge.hidden = false;
      } else badge.hidden = true;
    }

    document.querySelectorAll('[data-launcher-download]').forEach(el => {
      if (el.tagName === 'A') { if(s.launcher_url) el.href=s.launcher_url; else el.removeAttribute('href'); }
      el.dataset.launcherUrl = s.launcher_url || '';
    });

    document.querySelectorAll('[data-support-email]').forEach(el => {
      el.textContent = s.support_email || defaults.support_email;
      if (el.tagName === 'A') el.href = `mailto:${s.support_email || defaults.support_email}`;
    });
    document.querySelectorAll('[data-funpay-url]').forEach(el => { if (el.tagName === 'A') el.href = s.funpay_url || defaults.funpay_url; });
    document.querySelectorAll('[data-telegram-url]').forEach(el => { if (el.tagName === 'A') el.href = s.telegram_url || defaults.telegram_url; });
    document.querySelectorAll('[data-discord-url]').forEach(el => { if (el.tagName === 'A') el.href = s.discord_url || defaults.discord_url; });

    window.dispatchEvent(new CustomEvent('lunavisual:settings', { detail: s }));
    return s;
  }

  async function loadSettings() {
    let s = { ...defaults };
    try {
      if (window.supabase && cfg.supabaseUrl && cfg.supabasePublishableKey) {
        const sb = window.LunaVisualSupabase || window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'lunavisual-auth-v2' }
        });
        window.LunaVisualSupabase = sb;
        const { data, error } = await sb.from('site_settings').select('*').eq('id', 1).maybeSingle();
        if (!error && data) s = { ...s, ...data };
      }
    } catch (e) {
      console.warn('LunaVisual settings fallback:', e);
    }
    return applySettings(s);
  }

  window.loadLunaVisualSettings = loadSettings;
  window.applyLunaVisualPublicSettings = applySettings;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadSettings, { once: true });
  else loadSettings();
})();
