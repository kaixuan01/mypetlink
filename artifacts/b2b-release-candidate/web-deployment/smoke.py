"""Read-only deployed web/API checks; creates no business records."""
import urllib.request, urllib.error, urllib.parse, re, json, datetime, concurrent.futures, pathlib, hashlib

ROOT=pathlib.Path(__file__).resolve().parent
WEB="https://mypetlink.com.my"
API="https://api.mypetlink.com.my"

def get(url):
    req=urllib.request.Request(url,headers={"Cache-Control":"no-cache","User-Agent":"MyPetLink-Release-ReadOnly-Smoke"})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:
            return response.status, response.read().decode("utf-8",errors="replace"),dict(response.headers),response.url
    except urllib.error.HTTPError as error:
        return error.code,error.read().decode("utf-8",errors="replace"),dict(error.headers),error.url

def check(pair):
    origin,path,expected=pair
    try:
        status,body,headers,url=get(origin+path)
        item={"url":origin+path,"final_url":url,"status":status,"expected":expected,"pass":status==expected,
              "cache_control":headers.get("Cache-Control"),"robots_header":headers.get("X-Robots-Tag"),
              "body_sha256":hashlib.sha256(body.encode()).hexdigest()}
        if "health" in path or status>=400:item["response_excerpt"]=body[:600]
        if origin==WEB:
            item["title"]=(re.findall(r"<title>(.*?)</title>",body) or [None])[0]
            item["branded"]="MyPetLink" in body
            item["pass"] &= item["branded"]
        return item
    except Exception as error:return {"url":origin+path,"pass":False,"error":str(error)}

paths=[(WEB,p,200) for p in ["/","/where-to-buy","/admin/login","/admin/merchant-sales","/login","/tags/order"]]
paths += [(API,p,status) for p,status in [("/health/live",200),("/health/ready",200),
    ("/api/v1/admin/merchant-sales/consignment/approval-policy",401),
    ("/api/v1/admin/merchant-sales/consignment/agreements",401),
    ("/api/v1/admin/merchant-sales/merchants",401),("/api/v1/orders",401),("/api/v1/tags",401),
    ("/api/v1/tag-products",200)]]
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: checks=list(pool.map(check,paths))

_,home,_,_=get(WEB+"/")
markers=dict(re.findall(r'<meta name="mypetlink-release-([^"]+)" content="([^"]+)"',home))
assert all(markers.get(k)=="true" for k in ["smart-tags","tag-orders","ordering","community"]),markers
assert '<meta name="robots" content="index, follow' in home
assert 'href="https://mypetlink.com.my' in home
_,admin,_,_=get(WEB+"/admin/merchant-sales")
scripts=sorted(set(re.findall(r'<script[^>]+src="([^"]+)"',admin)))
def chunk(src):
    status,body,_,_=get(urllib.parse.urljoin(WEB,src));return {"path":src,"status":status,"body":body}
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool: chunks=list(pool.map(chunk,scripts))
bundle="\n".join(c["body"] for c in chunks)
features={s:s in bundle for s in ["Consignment approval policy","Self-reviewed (Solo)","/api/v1/admin/merchant-sales/consignment"]}
result={"captured_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"read_only":True,
    "checks":checks,"release_markers":markers,"admin_bundle_features":features,
    "admin_js_assets":[{"path":c["path"],"status":c["status"],"sha256":hashlib.sha256(c["body"].encode()).hexdigest()} for c in chunks],
    "all_passed":all(c["pass"] for c in checks) and all(features.values()) and all(c["status"]==200 for c in chunks)}
(ROOT/"smoke-results.json").write_text(json.dumps(result,indent=2),encoding="utf-8")
print(json.dumps({"all_passed":result["all_passed"],"checks":[{"url":c["url"],"status":c.get("status"),"pass":c["pass"]} for c in checks],"release_markers":markers,"admin_features":features},indent=2))
if not result["all_passed"]:raise SystemExit(1)
