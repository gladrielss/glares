"""Copy photos that glarest's database still links on the old 'reqly' project
into the new project's storage, resized like new uploads, then repoint rows.

  python3 scripts/copy-old-photos.py            # dry run: download + resize only
  python3 scripts/copy-old-photos.py --apply    # upload + update rows

Needs SUPABASE_SECRET (new project's secret key) in the environment for --apply.
Re-runnable: rows already pointing at the new project are skipped.
"""
import io, json, os, subprocess, sys
from PIL import Image, ImageOps

NEW = "https://wrhgyxavswjcvtkbzmkc.supabase.co"
PUBLISHABLE = "sb_publishable_FcTbYEdACJ_x-kDYtjWGWA_tiT4nwvO"
OLD_HOST = "zrlrbucvnadnxsoqtgfd.supabase.co"
BUCKET = "request-images"
APPLY = "--apply" in sys.argv
SECRET = os.environ.get("SUPABASE_SECRET", "")
if APPLY and not SECRET:
    sys.exit("SUPABASE_SECRET is required for --apply")


def curl(args, data=None):
    p = subprocess.run(["curl", "-s", "--max-time", "120", "-w", "\n%{http_code}"] + args,
                       input=data, capture_output=True)
    body, _, code = p.stdout.rpartition(b"\n")
    return int(code or 0), body


def rest_get(path):
    code, body = curl(["-H", f"apikey: {PUBLISHABLE}", f"{NEW}/rest/v1/{path}"])
    assert code == 200, (path, code, body[:200])
    return json.loads(body)


def admin_headers():
    return ["-H", f"apikey: {SECRET}", "-H", f"Authorization: Bearer {SECRET}"]


def encode(img, max_edge, quality):
    im = img.copy()
    im.thumbnail((max_edge, max_edge), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)  # no EXIF: strips location etc.
    return buf.getvalue(), im.size


def load(url):
    code, body = curl(["-L", url])
    if code != 200:
        raise RuntimeError(f"download HTTP {code}")
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(body)))
    if img.mode not in ("RGB", "L"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
        img = bg
    return img.convert("RGB"), len(body)


def upload(path, data):
    # Multipart, like the site's own uploads: storage reads cacheControl from the form.
    code, body = curl(admin_headers() + ["-X", "POST", "-H", "x-upsert: true",
                                         "-F", "cacheControl=31536000",
                                         "-F", "file=@-;type=image/jpeg;filename=photo.jpg",
                                         f"{NEW}/storage/v1/object/{BUCKET}/{path}"], data)
    if code != 200:
        raise RuntimeError(f"upload {path}: HTTP {code} {body[:200]!r}")
    return f"{NEW}/storage/v1/object/public/{BUCKET}/{path}"


def patch(table, row_id, values):
    code, body = curl(admin_headers() + ["-X", "PATCH", "-H", "Content-Type: application/json",
                                         "-H", "Prefer: return=representation",
                                         "--data-binary", json.dumps(values),
                                         f"{NEW}/rest/v1/{table}?id=eq.{row_id}"])
    if code != 200 or not json.loads(body):
        raise RuntimeError(f"update {table} {row_id}: HTTP {code} {body[:200]!r}")


def object_path(url):
    return url.split(f"/public/{BUCKET}/", 1)[1].split("?")[0]


def stem(path):
    name = path.rsplit("/", 1)[-1]
    return name.rsplit(".", 1)[0] if "." in name else name


results = {"posts": 0, "avatars": 0, "failed": [], "bytes_in": 0, "bytes_out": 0}

posts = [r for r in rest_get("requests?select=id,user_id,image_url,image_width,image_height")
         if OLD_HOST in (r.get("image_url") or "")]
for r in posts:
    try:
        img, size_in = load(r["image_url"])
        full, (w, h) = encode(img, 1400, 82)
        thumb, _ = encode(img, 480, 75)
        results["bytes_in"] += size_in
        results["bytes_out"] += len(full) + len(thumb)
        base = stem(object_path(r["image_url"]))
        if APPLY:
            full_url = upload(f"{r['user_id']}/{base}.jpg", full)
            thumb_url = upload(f"{r['user_id']}/thumb/{base}-thumb.jpg", thumb)
            patch("requests", r["id"], {"image_url": full_url, "thumb_url": thumb_url,
                                        "image_width": w, "image_height": h})
        results["posts"] += 1
        print(f"post   {r['id'][:8]}  {size_in // 1024:5}KB -> full {len(full) // 1024:4}KB {w}x{h}, thumb {len(thumb) // 1024:3}KB")
    except Exception as e:  # keep going; report at the end
        results["failed"].append(("post", r["id"], str(e)))
        print(f"post   {r['id'][:8]}  FAILED: {e}")

profiles = [p for p in rest_get("profiles?select=id,username,avatar_url")
            if OLD_HOST in (p.get("avatar_url") or "")]
for p in profiles:
    try:
        img, size_in = load(p["avatar_url"])
        avatar, (w, h) = encode(img, 512, 85)
        results["bytes_in"] += size_in
        results["bytes_out"] += len(avatar)
        base = stem(object_path(p["avatar_url"]))
        if APPLY:
            url = upload(f"avatars/{p['id']}/{base}.jpg", avatar)
            patch("profiles", p["id"], {"avatar_url": url})
        results["avatars"] += 1
        print(f"avatar {p['username'][:14]:14}  {size_in // 1024:5}KB -> {len(avatar) // 1024:3}KB {w}x{h}")
    except Exception as e:
        results["failed"].append(("avatar", p["id"], str(e)))
        print(f"avatar {p['username'][:14]:14}  FAILED: {e}")

print(json.dumps({k: (v if k != "failed" else len(v)) for k, v in results.items()}))
for f in results["failed"]:
    print("FAILED", *f)
print("MODE:", "APPLIED" if APPLY else "dry run (nothing uploaded or changed)")
