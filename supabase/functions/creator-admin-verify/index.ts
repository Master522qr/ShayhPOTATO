import { cors, fetchProviderProfile, json, requireUser, service, upsertConnection } from '../_shared/common.ts'

async function refresh(provider:string, row:any) {
  if (!row.refresh_token) return row
  let r:Response, j:any
  if (provider==='youtube') {
    const body=new URLSearchParams({client_id:Deno.env.get('GOOGLE_CLIENT_ID')||'',client_secret:Deno.env.get('GOOGLE_CLIENT_SECRET')||'',refresh_token:row.refresh_token,grant_type:'refresh_token'})
    r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); j=await r.json()
  } else if (provider==='tiktok') {
    const body=new URLSearchParams({client_key:Deno.env.get('TIKTOK_CLIENT_KEY')||'',client_secret:Deno.env.get('TIKTOK_CLIENT_SECRET')||'',refresh_token:row.refresh_token,grant_type:'refresh_token'})
    r=await fetch('https://open.tiktokapis.com/v2/oauth/token/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); j=await r.json()
  } else {
    const body=new URLSearchParams({client_id:Deno.env.get('TWITCH_CLIENT_ID')||'',client_secret:Deno.env.get('TWITCH_CLIENT_SECRET')||'',refresh_token:row.refresh_token,grant_type:'refresh_token'})
    r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); j=await r.json()
  }
  if (!r.ok) throw new Error(`${provider}_refresh_failed`)
  const next={...row,access_token:j.access_token,refresh_token:j.refresh_token||row.refresh_token,scope:Array.isArray(j.scope)?j.scope.join(' '):(j.scope||row.scope),expires_at:new Date(Date.now()+Number(j.expires_in||3600)*1000).toISOString(),updated_at:new Date().toISOString()}
  const {error}=await service.from('creator_oauth_tokens').upsert(next,{onConflict:'user_id,provider'}); if(error)throw error
  return next
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors})
  try{
    const admin=await requireUser(req)
    const {data:role,error:roleError}=await service.from('admin_roles').select('role').eq('user_id',admin.id).maybeSingle()
    if(roleError) throw roleError
    if(!role || !['admin','super_admin'].includes(role.role)) return json({error:'admin_required'},403)
    const {connection_id}=await req.json()
    if(!connection_id) return json({error:'connection_id_required'},400)
    const {data:conn,error:connError}=await service.from('creator_connections').select('*').eq('id',connection_id).maybeSingle()
    if(connError) throw connError
    if(!conn) return json({error:'connection_not_found'},404)
    const {data:row,error}=await service.from('creator_oauth_tokens').select('*').eq('user_id',conn.user_id).eq('provider',conn.provider).maybeSingle()
    if(error) throw error
    if(!row) return json({error:'provider_token_missing'},404)
    let token=row
    if(!row.expires_at || new Date(row.expires_at).getTime()<Date.now()+60_000) token=await refresh(conn.provider,row)
    const profile=await fetchProviderProfile(conn.provider,token.access_token)
    const updated=await upsertConnection(conn.user_id,conn.provider,profile)
    return json({ok:true,connection:updated})
  }catch(e){return json({error:e.message||String(e)},400)}
})
