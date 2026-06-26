# Bookmarklet — Add Current Listing

Two options. Pick one and drag it into your Safari bookmarks bar.

---

## Option A — Opens the app with the URL pre-filled (simpler)

Replace `YOUR_LAN_IP` with the IP shown when you start the server (e.g. `192.168.1.42`).

```
javascript:(function(){window.open('http://YOUR_LAN_IP:8005?url='+encodeURIComponent(window.location.href),'_blank');})();
```

**How to install in Safari:**
1. Create any bookmark (e.g. bookmark this page).
2. Edit that bookmark and replace its URL with the javascript: snippet above.
3. Drag the bookmark to your bookmarks bar.

Clicking it while viewing a listing opens the tracker in a new tab and immediately starts adding the URL.

---

## Option B — POSTs directly (no UI round-trip)

Replace `YOUR_LAN_IP` before using.

```
javascript:(function(){var u=window.location.href;fetch('http://YOUR_LAN_IP:8005/api/listings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:u})}).then(function(r){return r.json();}).then(function(d){alert(d.title?'Added: '+d.title:'Added (no title extracted)');}).catch(function(e){alert('Error: '+e);});})();
```

This fires a POST directly from the current page without opening the app. A browser alert confirms success or reports an error. Because the tracker runs on your LAN and CORS is open (`allow_origins=["*"]`), this works from any listing site.

---

## Finding your LAN IP

Run `start.sh` — it prints both the local and network addresses at startup. The network address is what to put in the bookmarklet.
