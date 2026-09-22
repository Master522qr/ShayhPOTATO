(() => {
  'use strict';
  const cfg = window.LUNAVISUAL_CONFIG || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = d => d ? new Date(d).toLocaleString('ru-RU') : '—';
  const rankLabel = r => ({user:'Пользователь',admin:'Админ',media:'Media',youtube:'YouTube',tiktok:'TikTok',twitch_streamer:'Twitch Streamer',tester:'Тестер'}[r] || r || 'Пользователь');
  const roleLabel = r => ({user:'Пользователь',admin:'Админ',super_admin:'Глава / Super Admin'}[r] || r);
  const st = (id, msg, bad=false) => { const e=$(id); if(!e) return; e.textContent=msg; e.className=`status ${bad?'bad':'ok'}`; };
  let sb, session, role='user', users=[], keys=[], alphaKeys=[], connections=[], apps=[], models=[], orders=[], news=[];
  const isFullAdmin = () => ['admin','super_admin'].includes(role);
  const canReview = () => ['admin','super_admin'].includes(role);

  async function init(){
    if(!window.supabase) throw new Error('Supabase JS не загрузился');
    sb = window.LunaVisualSupabase || window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'lunavisual-auth-v2'}});
    window.LunaVisualSupabase=sb;
    const s=await sb.auth.getSession(); if(s.error) throw s.error; session=s.data.session;
    if(!session){ location.href='profile.html?next=admin.html'; return; }
    const r=await sb.rpc('current_lunavisual_role'); if(r.error) throw r.error; role=r.data||'user';
    if($('currentRole')) $('currentRole').textContent=roleLabel(role);
    if(!canReview()){
      $('guardStatus').innerHTML='<strong>Доступ запрещён</strong><div class="muted">Для этой страницы нужны права Admin или Super Admin.</div>';
      return;
    }
    $('guardStatus').classList.add('hidden'); $('adminContent').classList.remove('hidden');
    applyPermissions(); bind(); await refreshAll();
  }

  function applyPermissions(){
    const full=isFullAdmin();
    document.querySelectorAll('[data-admin-section],[data-admin-link]').forEach(el=>{el.style.display=full?'':'none'});
    const note=$('permissionNote');
    if(note) note.innerHTML = `<strong>${esc(roleLabel(role))}</strong> — доступны ключи, аккаунты, новости, модельки, настройки сайта и разбор заявок.${role==='super_admin'?' Только глава может назначать права Admin/Super Admin.':''}`;
  }

  function bind(){
    $('logoutBtn')?.addEventListener('click',async()=>{await sb.auth.signOut();location.href='profile.html'});
    $('refreshBtn')?.addEventListener('click',refreshAll);
    $('keyLifetime')?.addEventListener('change',e=>{if($('keyDays'))$('keyDays').disabled=e.target.checked});
    $('alphaLifetime')?.addEventListener('change',e=>{if($('alphaDays'))$('alphaDays').disabled=e.target.checked});
    $('generateBtn')?.addEventListener('click',()=>generate('normal'));
    $('generateAlphaBtn')?.addEventListener('click',()=>generate('alpha'));
    $('deleteUsedBtn')?.addEventListener('click',()=>deleteUsed('normal'));
    $('deleteUsedAlphaBtn')?.addEventListener('click',()=>deleteUsed('alpha'));
    $('keyFilter')?.addEventListener('input',renderKeys); $('alphaFilter')?.addEventListener('input',renderAlpha); $('userFilter')?.addEventListener('input',renderUsers);
    $('newsForm')?.addEventListener('submit',publishNews); $('modelForm')?.addEventListener('submit',createModel);
    $('verifyAllCreatorsBtn')?.addEventListener('click',verifyAllCreators);
    $('grantModelBtn')?.addEventListener('click',()=>changeModelAccess(true));
    $('revokeModelBtn')?.addEventListener('click',()=>changeModelAccess(false));
  }

  async function refreshAll(){
    try{
      if(canReview()) await loadCreators();
      if(isFullAdmin()){
        st('keyStatus','Обновление…');
        await loadUsers();
        await Promise.all([loadKeys(),loadAlpha(),loadNews(),loadModels(),loadOrders()]);
        st('keyStatus','Готово.');
      }
    }catch(e){
      console.error(e); st('creatorStatus',`Ошибка обновления: ${e.message}`,true); st('keyStatus',`Ошибка: ${e.message}`,true);
    }
  }

  async function loadUsers(){
    const [p,r]=await Promise.all([
      sb.from('profiles').select('id,email,mc_nickname,rank,subscription_active,subscription_until,subscription_expires_at,subscription_lifetime,alpha_access_until,alpha_lifetime,hwid,force_logout_after,created_at').order('created_at',{ascending:false}).limit(10000),
      sb.from('admin_roles').select('user_id,role')
    ]);
    if(p.error) throw p.error; if(r.error) throw r.error;
    const rm=Object.fromEntries((r.data||[]).map(x=>[x.user_id,x.role]));
    users=(p.data||[]).map(x=>({...x,admin_role:rm[x.id]||'user'}));
    if($('statUsers')) $('statUsers').textContent=users.length; renderUsers(); renderModelAccessSelectors();
  }
  const userMap=()=>Object.fromEntries(users.map(u=>[u.id,u]));

  function renderUsers(){
    if(!$('usersBody')) return;
    const q=($('userFilter')?.value||'').trim().toLowerCase();
    const arr=users.filter(u=>!q||[u.id,u.email,u.mc_nickname,u.rank,u.admin_role].some(v=>String(v||'').toLowerCase().includes(q)));
    const ranks=['user','youtube','tiktok','twitch_streamer','tester','media','admin'];
    const serviceRoles=['user','admin','super_admin'];
    $('usersBody').innerHTML=arr.length?arr.map(u=>{
      const ar=u.admin_role||'user';
      const sub=u.subscription_lifetime?'Навсегда':u.subscription_expires_at?fmt(u.subscription_expires_at):(u.subscription_until||'Нет');
      const alpha=u.alpha_lifetime?'Навсегда':u.alpha_access_until?fmt(u.alpha_access_until):'Нет';
      const roleControl=role==='super_admin'?`<div class="row" style="margin-top:8px"><select class="input" data-rolesel="${u.id}" style="width:170px">${serviceRoles.map(o=>`<option value="${o}" ${o===ar?'selected':''}>${esc(roleLabel(o))}</option>`).join('')}</select><button class="btn" data-setrole="${u.id}">Права</button></div>`:'';
      return `<tr><td><code>${esc(u.id)}</code></td><td>${esc(u.email||'—')}</td><td>${esc(u.mc_nickname||'—')}</td><td><span class="rank-badge rank-${esc(u.rank)}">${esc(rankLabel(u.rank))}</span></td><td>${esc(roleLabel(ar))}</td><td>${esc(sub)}</td><td>${esc(alpha)}</td><td><code>${esc(u.hwid||'—')}</code></td><td><div class="row"><select class="input" data-ranksel="${u.id}" style="width:160px">${ranks.map(o=>`<option value="${o}" ${o===u.rank?'selected':''}>${esc(rankLabel(o))}</option>`).join('')}</select><button class="btn" data-setrank="${u.id}">Ранг</button></div>${roleControl}<div class="row" style="margin-top:8px"><button class="btn ok" data-grantsub="${u.id}">Выдать подписку</button><button class="btn danger" data-logoutuser="${u.id}">Завершить сессию</button></div></td></tr>`;
    }).join(''):'<tr><td colspan="9">Аккаунтов нет</td></tr>';
    document.querySelectorAll('[data-setrank]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.setrank, sel=document.querySelector(`[data-ranksel="${id}"]`);
      const {error}=await sb.rpc('admin_set_lunavisual_rank',{p_user_id:id,p_rank:sel.value});
      if(error) st('userStatus',error.message,true); else {st('userStatus','Ранг обновлён.');await loadUsers();}
    });
    document.querySelectorAll('[data-setrole]').forEach(b=>b.onclick=async()=>{
      const id=b.dataset.setrole, sel=document.querySelector(`[data-rolesel="${id}"]`);
      if(!confirm(`Назначить права «${roleLabel(sel.value)}»?`)) return;
      const {error}=await sb.rpc('admin_set_lunavisual_role',{p_user_id:id,p_role:sel.value});
      if(error) st('userStatus',error.message,true); else {st('userStatus','Служебные права обновлены.');await loadUsers();}
    });
    document.querySelectorAll('[data-grantsub]').forEach(b=>b.onclick=async()=>{const id=b.dataset.grantsub;const raw=prompt('Сколько дней выдать? Введите 0 для «Навсегда».','30');if(raw===null)return;const n=Number(raw);if(!Number.isFinite(n)||n<0){st('userStatus','Введите 0 или количество дней.',true);return}const {error}=await sb.rpc('admin_grant_lunavisual_subscription',{p_user_id:id,p_days:n===0?null:Math.floor(n),p_lifetime:n===0});if(error)st('userStatus',error.message,true);else{st('userStatus','Подписка обновлена.');await loadUsers();}});
    document.querySelectorAll('[data-logoutuser]').forEach(b=>b.onclick=async()=>{const id=b.dataset.logoutuser;if(!confirm('Завершить текущую сессию пользователя на сайте и пометить её для завершения в новом лаунчере?'))return;const {error}=await sb.rpc('admin_force_logout_lunavisual_user',{p_user_id:id});if(error)st('userStatus',error.message,true);else st('userStatus','Сессия помечена на завершение. Пользователь должен войти снова.');});
  }

  async function loadKeys(){const r=await sb.from('license_keys').select('*').order('created_at',{ascending:false}).limit(10000);if(r.error)throw r.error;keys=r.data||[];if($('statKeys'))$('statKeys').textContent=keys.length;renderKeys();}
  function renderKeys(){if(!$('keysBody'))return;const q=($('keyFilter')?.value||'').trim().toLowerCase(),arr=keys.filter(k=>!q||[k.code,k.used_by,k.used_by_user_id,k.created_by_name].some(v=>String(v||'').toLowerCase().includes(q)));$('keysBody').innerHTML=arr.length?arr.map(k=>`<tr><td><button class="btn" data-copy="${esc(k.code)}">${esc(k.code)}</button></td><td>${k.duration_days==null?'Навсегда':`${k.duration_days} дн.`}</td><td><span class="tag ${k.is_used?'bad':'ok'}">${k.is_used?'Использован':'Свободен'}</span></td><td>${esc(k.created_by_name||k.created_by||'—')}</td><td>${esc(k.used_by||'—')}</td><td><code>${esc(k.used_by_user_id||'—')}</code></td><td>${fmt(k.used_at)}</td><td>${k.duration_days==null&&k.is_used?'Навсегда':fmt(k.activation_expires_at)}</td><td>${fmt(k.created_at)}</td><td><button class="btn danger" data-delkey="${k.id}">Удалить</button></td></tr>`).join(''):'<tr><td colspan="10">Ключей нет</td></tr>';wireCopy();document.querySelectorAll('[data-delkey]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить ключ?'))return;const r=await sb.rpc('admin_delete_lunavisual_key',{p_key_id:Number(b.dataset.delkey)});if(r.error)st('keyStatus',r.error.message,true);else await loadKeys();});}
  async function loadAlpha(){const r=await sb.from('alpha_keys').select('*').order('created_at',{ascending:false}).limit(10000);if(r.error)throw r.error;alphaKeys=r.data||[];if($('statAlpha'))$('statAlpha').textContent=alphaKeys.length;renderAlpha();}
  function renderAlpha(){if(!$('alphaBody'))return;const q=($('alphaFilter')?.value||'').trim().toLowerCase(),arr=alphaKeys.filter(k=>!q||[k.code,k.used_by,k.used_by_user_id,k.created_by_name].some(v=>String(v||'').toLowerCase().includes(q)));$('alphaBody').innerHTML=arr.length?arr.map(k=>`<tr><td><button class="btn" data-copy="${esc(k.code)}">${esc(k.code)}</button></td><td>${k.duration_days==null?'Навсегда':`${k.duration_days} дн.`}</td><td><span class="tag ${k.is_used?'bad':'ok'}">${k.is_used?'Использован':'Свободен'}</span></td><td>${esc(k.created_by_name||k.created_by||'—')}</td><td>${esc(k.used_by||'—')}</td><td><code>${esc(k.used_by_user_id||'—')}</code></td><td>${fmt(k.used_at)}</td><td>${k.duration_days==null&&k.is_used?'Навсегда':fmt(k.activation_expires_at)}</td><td>${fmt(k.created_at)}</td><td><button class="btn danger" data-delalpha="${k.id}">Удалить</button></td></tr>`).join(''):'<tr><td colspan="10">Alpha-ключей нет</td></tr>';wireCopy();document.querySelectorAll('[data-delalpha]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить Alpha-ключ?'))return;const r=await sb.rpc('admin_delete_lunavisual_alpha_key',{p_key_id:Number(b.dataset.delalpha)});if(r.error)st('alphaStatus',r.error.message,true);else await loadAlpha();});}
  async function generate(kind){const alpha=kind==='alpha',countEl=$(alpha?'alphaCount':'keyCount'),daysEl=$(alpha?'alphaDays':'keyDays'),lifeEl=$(alpha?'alphaLifetime':'keyLifetime'),outEl=$(alpha?'generatedAlphaKeys':'generatedKeys'),btn=$(alpha?'generateAlphaBtn':'generateBtn'),statusId=alpha?'alphaStatus':'keyStatus',rpc=alpha?'generate_lunavisual_alpha_keys':'generate_lunavisual_keys';const total=Math.max(1,Math.min(10000,Number(countEl.value)||1)),days=lifeEl.checked?null:Math.max(1,Math.min(36500,Number(daysEl.value)||7)),out=[];btn.disabled=true;outEl.value='';try{for(let done=0;done<total;done+=250){const part=Math.min(250,total-done);st(statusId,`Создание ${done+part} / ${total}…`);const r=await sb.rpc(rpc,{p_count:part,p_duration_days:days});if(r.error)throw r.error;(r.data||[]).forEach(x=>out.push(x.code));}outEl.value=out.join('\n');st(statusId,`Готово: ${out.length} ключей сохранено в базе.`);alpha?await loadAlpha():await loadKeys();}catch(e){st(statusId,`Ошибка: ${e.message}`,true);}finally{btn.disabled=false;}}
  async function deleteUsed(kind){const alpha=kind==='alpha';if(!confirm(`Удалить все использованные ${alpha?'Alpha-':''}ключи?`))return;const r=await sb.rpc(alpha?'admin_delete_used_lunavisual_alpha_keys':'admin_delete_used_lunavisual_keys');if(r.error)st(alpha?'alphaStatus':'keyStatus',r.error.message,true);else{st(alpha?'alphaStatus':'keyStatus',`Удалено: ${r.data||0}`);alpha?await loadAlpha():await loadKeys();}}

  async function loadCreators(){
    const [c,a]=await Promise.all([
      sb.from('creator_connections').select('*').order('last_verified_at',{ascending:false}).limit(5000),
      sb.from('creator_applications').select('*').order('created_at',{ascending:false}).limit(5000)
    ]);
    if(c.error)throw c.error;if(a.error)throw a.error;connections=c.data||[];apps=a.data||[];renderConnections();renderCreatorApps();
  }
  function activityHtml(c){const v7=Number(c?.recent_video_count_7d||0),v14=Number(c?.recent_video_count_14d||0),ok=!!c?.activity_ok;return `<span class="${ok?'activity-ok':'activity-warn'}"><strong>${v7}</strong> / ${v14}</span><div class="small muted">${esc(c?.activity_note||'нет данных')}</div>`;}
    function renderConnections(){if(!$('connectionsBody'))return;const um=userMap();$('connectionsBody').innerHTML=connections.length?connections.map(c=>`<tr><td><code>${esc(c.user_id)}</code><div class="small muted">${esc(um[c.user_id]?.email||'')}</div></td><td>${esc(c.provider)}</td><td><code>${esc(c.provider_user_id)}</code></td><td>${c.profile_url?`<a href="${esc(c.profile_url)}" target="_blank" rel="noopener">${esc(c.display_name||c.handle||'Открыть')}</a>`:esc(c.display_name||c.handle||'—')}</td><td>${Number(c.follower_count||0).toLocaleString('ru-RU')}</td><td>${activityHtml(c)}</td><td><span class="tag ${c.suspicious?'warn':'ok'}">${Number(c.quality_score||0)}/100</span><div class="small muted">${esc(c.quality_note||'')}</div></td><td>${fmt(c.last_verified_at)}<div style="margin-top:8px"><button class="btn" data-verifyconn="${c.id}">Проверить</button></div></td></tr>`).join(''):'<tr><td colspan="8">Подключений нет</td></tr>';document.querySelectorAll('[data-verifyconn]').forEach(b=>b.onclick=()=>verifyCreatorConnection(b.dataset.verifyconn));}
  function renderCreatorApps(){if(!$('creatorAppsBody'))return;const um=userMap(),cm=Object.fromEntries(connections.map(c=>[c.id,c]));$('creatorAppsBody').innerHTML=apps.length?apps.map(a=>{const u=um[a.user_id],c=cm[a.connection_id];const actions=a.status==='pending'?`<div class="row"><button class="btn ok" data-review="${a.id}" data-ok="1">Одобрить</button><button class="btn danger" data-review="${a.id}" data-ok="0">Отклонить</button></div>`:'—';return `<tr><td>#${a.id}</td><td>${esc(u?.mc_nickname||u?.email||a.user_id)}<div class="small muted"><code>${esc(a.user_id)}</code></div></td><td>${esc(a.provider)} → ${esc(rankLabel(a.requested_rank))}</td><td>${esc(c?.display_name||c?.handle||'—')}<div class="small muted"><code>${esc(c?.provider_user_id||'')}</code></div></td><td>${Number(a.follower_count_at_apply||0).toLocaleString('ru-RU')}</td><td>${activityHtml({recent_video_count_7d:a.recent_video_count_7d_at_apply??c?.recent_video_count_7d,recent_video_count_14d:a.recent_video_count_14d_at_apply??c?.recent_video_count_14d,activity_ok:a.activity_ok_at_apply??c?.activity_ok,activity_note:c?.activity_note})}</td><td>${Number(a.quality_score_at_apply||0)}/100</td><td>${esc(a.status)}</td><td>${actions}</td></tr>`;}).join(''):'<tr><td colspan="9">Заявок нет</td></tr>';document.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{const note=prompt('Комментарий к решению (необязательно):','')||'';const r=await sb.rpc('admin_review_creator_application',{p_application_id:Number(b.dataset.review),p_approve:b.dataset.ok==='1',p_note:note});if(r.error)st('creatorStatus',r.error.message,true);else{st('creatorStatus','Заявка обработана.');if(isFullAdmin())await loadUsers();await loadCreators();}});}

  async function invokeEdge(name,body){const r=await fetch(`${cfg.supabaseUrl}/functions/v1/${name}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',apikey:cfg.supabasePublishableKey},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j;}
  async function verifyCreatorConnection(id){st('creatorStatus','Проверяем канал…');try{await invokeEdge('creator-admin-verify',{connection_id:id});await loadCreators();st('creatorStatus','Статистика канала обновлена.');}catch(e){st('creatorStatus',`Ошибка проверки: ${e.message}`,true);}}
  async function verifyAllCreators(){const btn=$('verifyAllCreatorsBtn');if(btn)btn.disabled=true;try{for(let i=0;i<connections.length;i++){st('creatorStatus',`Проверка ${i+1} / ${connections.length}…`);await invokeEdge('creator-admin-verify',{connection_id:connections[i].id});}await loadCreators();st('creatorStatus',`Проверено каналов: ${connections.length}.`);}catch(e){st('creatorStatus',`Ошибка проверки: ${e.message}`,true);}finally{if(btn)btn.disabled=false;}}
  function renderModelAccessSelectors(){const us=$('modelUserSelect'),ms=$('modelGrantSelect');if(us){const prev=us.value;us.innerHTML=users.length?users.map(u=>`<option value="${u.id}">${esc(u.mc_nickname||u.email||u.id)} — ${esc(u.email||u.id)}</option>`).join(''):'<option value="">Нет пользователей</option>';if([...us.options].some(o=>o.value===prev))us.value=prev;}if(ms){const prev=ms.value;ms.innerHTML=models.length?models.map(m=>`<option value="${m.id}">${esc(m.name)} (${Number(m.price_rub||0).toLocaleString('ru-RU')} ₽)</option>`).join(''):'<option value="">Нет моделек</option>';if([...ms.options].some(o=>o.value===prev))ms.value=prev;}}
  async function changeModelAccess(grant){const user=$('modelUserSelect')?.value,model=$('modelGrantSelect')?.value;if(!user||!model){st('modelAccessStatus','Выберите пользователя и модель.',true);return}const rpc=grant?'admin_grant_lunavisual_model':'admin_revoke_lunavisual_model',args=grant?{p_user_id:user,p_model_id:model,p_order_id:null}:{p_user_id:user,p_model_id:model};const r=await sb.rpc(rpc,args);if(r.error)st('modelAccessStatus',r.error.message,true);else st('modelAccessStatus',grant?'Модель выдана пользователю.':'Доступ к модели отозван.');}

  async function uploadPublic(bucket,file,prefix){const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${prefix}/${Date.now()}-${crypto.randomUUID()}-${safe}`;const up=await sb.storage.from(bucket).upload(path,file,{upsert:false,contentType:file.type});if(up.error)throw up.error;const pub=sb.storage.from(bucket).getPublicUrl(path);return {path,url:pub.data.publicUrl};}
  async function publishNews(e){e.preventDefault();st('newsStatus','Публикация…');try{let image_url=null;const f=$('newsImage').files?.[0];if(f)image_url=(await uploadPublic('news',f,'posts')).url;const r=await sb.from('news').insert({title:$('newsTitle').value.trim(),description:$('newsDescription').value.trim(),image_url,is_published:$('newsPublished').checked,published_at:new Date().toISOString(),author_id:session.user.id});if(r.error)throw r.error;e.target.reset();$('newsPublished').checked=true;st('newsStatus','Новость сохранена.');await loadNews();}catch(err){st('newsStatus',err.message,true);}}
  async function loadNews(){const r=await sb.from('news').select('*').order('published_at',{ascending:false}).limit(100);if(r.error)throw r.error;news=r.data||[];if(!$('adminNewsList'))return;$('adminNewsList').innerHTML=news.length?news.map(n=>`<article class="news-card">${n.image_url?`<img src="${esc(n.image_url)}" alt="">`:''}<div class="body"><h3>${esc(n.title)}</h3><p>${esc(n.description)}</p><div class="row" style="margin-top:12px"><span class="tag ${n.is_published?'ok':'warn'}">${n.is_published?'Опубликовано':'Черновик'}</span><button class="btn danger" data-delnews="${n.id}">Удалить</button></div></div></article>`).join(''):'<div class="muted">Новостей нет.</div>';document.querySelectorAll('[data-delnews]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить новость?'))return;const r=await sb.from('news').delete().eq('id',Number(b.dataset.delnews));if(r.error)st('newsStatus',r.error.message,true);else await loadNews();});}

  async function createModel(e){e.preventDefault();st('modelStatus','Загрузка…');try{const name=$('modelName').value.trim(),slug=$('modelSlug').value.trim().toLowerCase(),desc=$('modelDescription').value.trim(),price=Math.max(0,Number($('modelPrice').value)||0),pf=$('modelPreview').files?.[0],af=$('modelAsset').files?.[0];if(!af)throw new Error('Выберите файл модели.');let preview_url=null,asset_path=null;if(pf)preview_url=(await uploadPublic('models-preview',pf,slug)).url;const safe=af.name.replace(/[^a-zA-Z0-9._-]/g,'_');asset_path=`${slug}/${Date.now()}-${safe}`;const up=await sb.storage.from('models-assets').upload(asset_path,af,{upsert:false,contentType:af.type||'application/octet-stream'});if(up.error)throw up.error;const r=await sb.from('models').insert({name,slug,description:desc,price_rub:price,preview_url,asset_path,active:true,created_by:session.user.id});if(r.error)throw r.error;e.target.reset();$('modelPrice').value='300';st('modelStatus','Моделька добавлена.');await loadModels();}catch(err){st('modelStatus',err.message,true);}}
  async function loadModels(){const r=await sb.from('models').select('*').order('created_at',{ascending:false});if(r.error)throw r.error;models=r.data||[];renderModelAccessSelectors();if(!$('modelsBody'))return;$('modelsBody').innerHTML=models.length?models.map(m=>`<tr><td>${esc(m.name)}</td><td><code>${esc(m.slug)}</code></td><td>${Number(m.price_rub||0).toLocaleString('ru-RU')} ₽</td><td>${m.active?'Да':'Нет'}</td><td><code>${esc(m.asset_path||'—')}</code></td><td><div class="row"><button class="btn" data-togglemodel="${m.id}" data-active="${m.active?'0':'1'}">${m.active?'Скрыть':'Включить'}</button><button class="btn danger" data-delmodel="${m.id}">Удалить</button></div></td></tr>`).join(''):'<tr><td colspan="6">Моделек нет</td></tr>';document.querySelectorAll('[data-togglemodel]').forEach(b=>b.onclick=async()=>{const r=await sb.from('models').update({active:b.dataset.active==='1',updated_at:new Date().toISOString()}).eq('id',b.dataset.togglemodel);if(r.error)st('modelStatus',r.error.message,true);else await loadModels();});document.querySelectorAll('[data-delmodel]').forEach(b=>b.onclick=async()=>{if(!confirm('Удалить модельку из каталога?'))return;const r=await sb.from('models').delete().eq('id',b.dataset.delmodel);if(r.error)st('modelStatus',r.error.message,true);else await loadModels();});}
  async function loadOrders(){const r=await sb.from('model_orders').select('id,user_id,model_id,status,created_at,models(id,name,price_rub)').order('created_at',{ascending:false}).limit(5000);if(r.error)throw r.error;orders=r.data||[];if(!$('ordersBody'))return;$('ordersBody').innerHTML=orders.length?orders.map(o=>`<tr><td>#${o.id}</td><td><code>${esc(o.user_id)}</code></td><td>${esc(o.models?.name||o.model_id)}</td><td>${Number(o.models?.price_rub||0).toLocaleString('ru-RU')} ₽</td><td>${esc(o.status)}</td><td>${fmt(o.created_at)}</td><td>${o.status!=='granted'?`<button class="btn ok" data-grantorder="${o.id}" data-user="${o.user_id}" data-model="${o.model_id}">Выдать</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="7">Заказов нет</td></tr>';document.querySelectorAll('[data-grantorder]').forEach(b=>b.onclick=async()=>{const r=await sb.rpc('admin_grant_lunavisual_model',{p_user_id:b.dataset.user,p_model_id:b.dataset.model,p_order_id:Number(b.dataset.grantorder)});if(r.error)st('orderStatus',r.error.message,true);else{st('orderStatus','Моделька выдана пользователю.');await loadOrders();}});}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(e=>{$('guardStatus').innerHTML=`<strong>Ошибка</strong><div class="muted">${esc(e.message)}</div>`;}));
  else init().catch(e=>{$('guardStatus').innerHTML=`<strong>Ошибка</strong><div class="muted">${esc(e.message)}</div>`;});
})();
