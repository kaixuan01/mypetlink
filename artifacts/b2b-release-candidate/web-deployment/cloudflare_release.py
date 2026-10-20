"""Scoped Pages deployment operations using the existing Wrangler authentication.
No credentials or complete configuration responses are persisted or printed.
"""
import os, json, pathlib, tomllib, urllib.request, urllib.error, datetime, sys, hashlib

ROOT = pathlib.Path(__file__).resolve().parent
ACCOUNT = "8ff46718bf3f48a2724f2b108a2db2a9"
PROJECT = "mypetlink"
COMMIT = "2ff3b792b2f021168d257511d94ec71cf23e8b09"
HELD = "11b836fd-11b8-4e39-bd90-989552e160e9"
BASE = f"https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/pages/projects/{PROJECT}"

def token():
    if os.environ.get("CLOUDFLARE_API_TOKEN"):
        return os.environ["CLOUDFLARE_API_TOKEN"]
    candidates = [pathlib.Path.home()/".wrangler/config/default.toml"]
    if os.environ.get("APPDATA"):
        candidates += [pathlib.Path(os.environ["APPDATA"])/"xdg.config/.wrangler/config/default.toml",
                       pathlib.Path(os.environ["APPDATA"])/".wrangler/config/default.toml"]
    for path in candidates:
        if path.is_file():
            data = tomllib.loads(path.read_text(encoding="utf-8"))
            value = data.get("oauth_token") or data.get("api_token")
            if value: return value
    raise RuntimeError("Existing Wrangler credentials unavailable; no login or token creation attempted")

def api(suffix="", method="GET"):
    req = urllib.request.Request(BASE+suffix, method=method,
        headers={"Authorization":"Bearer "+token(), "Content-Type":"application/json"},
        data=b"{}" if method=="POST" else None)
    try:
        with urllib.request.urlopen(req,timeout=40) as response: data=json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Cloudflare {method} {suffix}: HTTP {error.code}") from None
    if not data.get("success"): raise RuntimeError("Cloudflare operation rejected: "+json.dumps(data.get("errors")))
    return data["result"]

def deployment(d):
    return {k:d.get(k) for k in ["id","environment","url","created_on","modified_on","latest_stage",
        "deployment_trigger","stages","is_skipped","skip_reason","uses_functions","aliases"]}

def save(name,value):
    (ROOT/name).write_text(json.dumps(value,indent=2),encoding="utf-8")

def inspect():
    p=api(); d=api("/deployments/"+HELD)
    assert p["name"]==PROJECT and p["production_branch"]=="main"
    assert d["environment"]=="production"
    assert d["deployment_trigger"]["metadata"]["commit_hash"]==COMMIT
    config=p.get("deployment_configs",{}).get("production",{})
    values={k:v.get("value") for k,v in config.get("env_vars",{}).items() if v.get("type")=="plain_text"}
    allowed=["NEXT_PUBLIC_API_BASE_URL","PUBLIC_API_BASE_URL","NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_SITE_URL",
        "NEXT_PUBLIC_SMART_TAGS_ENABLED","NEXT_PUBLIC_TAG_ORDERS_ENABLED","NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED",
        "NEXT_PUBLIC_SOCIAL_ENABLED","NEXT_PUBLIC_NOINDEX","NEXT_PUBLIC_DEV_AUTH_ENABLED",
        "NEXT_PUBLIC_SAFETY_PROFILES_OWNER_UI_ENABLED","NEXT_PUBLIC_PUBLIC_PROFILES_ENABLED","NODE_VERSION"]
    flags=["NEXT_PUBLIC_SMART_TAGS_ENABLED","NEXT_PUBLIC_TAG_ORDERS_ENABLED","NEXT_PUBLIC_SMART_TAG_ORDERING_ENABLED","NEXT_PUBLIC_SOCIAL_ENABLED"]
    for key in flags: assert values.get(key)=="true", f"Unexpected Production release flag: {key}"
    assert values.get("NEXT_PUBLIC_API_BASE_URL","").rstrip("/")=="https://api.mypetlink.com.my"
    assert values.get("NEXT_PUBLIC_DEV_AUTH_ENABLED","false")=="false"
    assert values.get("NEXT_PUBLIC_NOINDEX","false")=="false"
    assert values.get("NEXT_PUBLIC_GOOGLE_CLIENT_ID","").endswith(".apps.googleusercontent.com"), "Production Google public client ID unavailable"
    b=p["build_config"]
    assert b.get("root_dir")=="apps/web" and b.get("destination_dir")=="out" and b.get("build_command")=="npm run build"
    safe={"captured_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"account_id":ACCOUNT,
        "project":PROJECT,"production_branch":p["production_branch"],"domains":p.get("domains"),
        "build":{k:b.get(k) for k in ["build_command","root_dir","destination_dir"]},
        "production_public_settings":{k:values[k] for k in allowed if k in values},
        "google_client_id_present":True,"google_client_id_sha256":hashlib.sha256(values["NEXT_PUBLIC_GOOGLE_CLIENT_ID"].encode()).hexdigest(),
        "canonical_deployment":deployment(p.get("canonical_deployment") or {}),"held_deployment":deployment(d)}
    save("cloudflare-predeploy.json",safe)
    return safe

if __name__=="__main__":
    action=sys.argv[1] if len(sys.argv)>1 else "inspect"
    if action=="inspect": print(json.dumps(inspect(),indent=2))
    elif action=="retry":
        p=inspect()
        assert p["canonical_deployment"].get("deployment_trigger",{}).get("metadata",{}).get("commit_hash")!=COMMIT, "Already canonical; inspect instead of redeploying"
        d=api("/deployments/"+HELD+"/retry","POST")
        save("deployment-start.json",deployment(d));print(json.dumps(deployment(d),indent=2))
    elif action=="status":
        start=json.loads((ROOT/"deployment-start.json").read_text());d=api("/deployments/"+start["id"])
        safe=deployment(d);save("deployment-status.json",safe);print(json.dumps(safe,indent=2))
    elif action=="logs":
        start=json.loads((ROOT/"deployment-start.json").read_text());data=api("/deployments/"+start["id"]+"/history/logs")
        lines=[v["line"] for v in data.get("data",[])];save("build-log.json",data)
        print("\n".join(lines[-30:]))
    elif action=="canonical":
        p=api();d=deployment(p.get("canonical_deployment") or {});save("canonical-after.json",d);print(json.dumps(d,indent=2))
    else: raise RuntimeError("Unsupported scoped operation")
