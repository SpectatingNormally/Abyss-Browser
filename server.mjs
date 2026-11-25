import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);
const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const rateBuckets = new Map();
const MAX_PER_WINDOW = 40, WINDOW_MS = 60 * 60 * 1000;
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".txt":"text/plain; charset=utf-8", ".mjs":"text/javascript; charset=utf-8" };
function json(res,status,obj){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(obj));}
function checkRate(ip){const now=Date.now();let bucket=rateBuckets.get(ip);if(!bucket||now-bucket.start>=WINDOW_MS){bucket={start:now,count:0};rateBuckets.set(ip,bucket);}bucket.count++;return bucket.count<=MAX_PER_WINDOW;}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,"http://localhost");
  const requestOrigin=req.headers.origin||"";
  if(ALLOWED_ORIGIN && requestOrigin===ALLOWED_ORIGIN){res.setHeader("Access-Control-Allow-Origin",ALLOWED_ORIGIN);res.setHeader("Vary","Origin");}
  if(url.pathname==="/api/brave-search"){
    if(req.method==="OPTIONS"){if(!ALLOWED_ORIGIN||requestOrigin!==ALLOWED_ORIGIN)return json(res,403,{error:"Origin not allowed."});res.writeHead(204,{"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Methods":"GET, OPTIONS","Access-Control-Allow-Headers":"Accept","Vary":"Origin","Access-Control-Max-Age":"600"});return res.end();}
    if(req.method!=="GET")return json(res,405,{error:"Method not allowed"});
    if(!BRAVE_KEY)return json(res,503,{error:"Brave API key is not configured on the server."});
    const q=(url.searchParams.get("q")||"").trim();
    if(!q||q.length>200)return json(res,400,{error:"Query must be 1–200 characters."});
    const ip=(req.socket.remoteAddress||"unknown").trim();
    if(!checkRate(ip))return json(res,429,{error:"Search rate limit reached. Try again later."});
    try{
      const apiUrl=new URL("https://api.search.brave.com/res/v1/web/search");
      apiUrl.searchParams.set("q",q);apiUrl.searchParams.set("count","10");apiUrl.searchParams.set("country","US");apiUrl.searchParams.set("search_lang","en");apiUrl.searchParams.set("safesearch","strict");
      const upstream=await fetch(apiUrl,{headers:{Accept:"application/json","X-Subscription-Token":BRAVE_KEY},signal:AbortSignal.timeout(15000)});
      const data=await upstream.json().catch(()=>({}));
      if(!upstream.ok)return json(res,502,{error:"Brave search request failed."});
      const results=(data.web?.results||[]).slice(0,10).map(r=>({title:String(r.title||"").slice(0,300),url:String(r.url||""),description:String(r.description||"").slice(0,700)})).filter(r=>/^https?:\/\//i.test(r.url));
      return json(res,200,{results});
    }catch{return json(res,502,{error:"Could not reach Brave Search."});}
  }
  if(req.method!=="GET"&&req.method!=="HEAD")return json(res,405,{error:"Method not allowed"});
  let rel=decodeURIComponent(url.pathname==="/"?"index.html":url.pathname).replace(/^\/+/,"");
  let file=path.resolve(APP_ROOT,rel);
  if(!file.startsWith(APP_ROOT+path.sep)&&file!==APP_ROOT)return json(res,403,{error:"Forbidden"});
  try{let stat=await fs.stat(file);if(stat.isDirectory())file=path.join(file,"index.html");const body=await fs.readFile(file);res.writeHead(200,{"Content-Type":MIME[path.extname(file).toLowerCase()]||"application/octet-stream","X-Content-Type-Options":"nosniff"});res.end(req.method==="HEAD"?undefined:body);}catch{json(res,404,{error:"File not found"});}
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Abyss + Brave proxy running on port ${PORT}`));
