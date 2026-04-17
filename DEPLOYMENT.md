# Deployment Guide

## GOP-STOP ARKANOID P2P — Deployment Instructions

---

## 1. Overview

This static web application requires no backend server. Deploy the files to any static hosting service.

**Important**: HTTPS is required for WebRTC functionality.

---

## 2. File Structure

```
arkanoid-p2p/
├── index.html              # Main entry point
├── css/
│   └── style.css           # Styling (must be created if not present)
└── js/
    ├── main.js             # Application orchestration
    ├── game.js             # Game engine
    ├── network.js          # WebRTC networking
    ├── ui.js               # UI controller
    ├── levels.js           # Level definitions
    ├── audio.js            # Sound synthesis
    ├── performance.js      # Performance monitoring
    └── progression.js      # LocalStorage persistence
```

**Note**: The project currently includes inline CSS in `index.html`. For production, consider extracting to an external `css/style.css`.

---

## 3. Build Steps

### 3.1 No Build Required

This project uses vanilla JavaScript — no bundler, transpiler, or build step needed.

### 3.2 Optional Optimizations

```bash
# Minify JavaScript (if desired)
npx terser js/main.js -o js/main.min.js
npx terser js/game.js -o js/game.min.js
npx terser js/network.js -o js/network.min.js
# ... etc

# Update index.html to use .min.js files
```

### 3.3 Required CDN

The following external resource is loaded:

```html
<!-- PeerJS for WebRTC signaling -->
<script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
```

**Self-hosting option**: Download and host locally if preferred.

---

## 4. Deployment Options

### 4.1 GitHub Pages (Free, Recommended)

```bash
# 1. Create GitHub repository
# 2. Push code to main branch
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/arkanoid-p2p.git
git push -u origin main

# 3. Enable GitHub Pages
#    Settings → Pages → Source: Deploy from branch → main
# 4. Visit https://yourusername.github.io/arkanoid-p2p/
```

**Pros**: Free, auto-HTTPS, custom domain support

### 4.2 Netlify (Free Tier)

```bash
# Method 1: Drag & Drop
# 1. Zip the project files
# 2. Go to https://app.netlify.com/drop
# 3. Upload the zip

# Method 2: Git Integration
# 1. Connect GitHub repo to Netlify
# 2. Build settings:
#    - Build command: (leave empty)
#    - Publish directory: /
```

**Pros**: Instant deploy, branch previews, forms support

### 4.3 Vercel (Free Tier)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Or connect GitHub repo at https://vercel.com
```

**Pros**: Zero config, auto-HTTPS, serverless functions if needed later

### 4.4 Cloudflare Pages (Free)

```bash
# 1. Connect GitHub repo at https://dash.cloudflare.com
# 2. Build settings:
#    - Build command: (none)
#    - Build output: /
# 3. Deploy
```

**Pros**: CDN distribution, excellent global performance

### 4.5 AWS S3 + CloudFront

```bash
# 1. Create S3 bucket with static website hosting
# 2. Upload files
aws s3 sync . s3://your-bucket-name --exclude '.git/*' --exclude 'node_modules/*'

# 3. Configure CloudFront distribution
# 4. Point custom domain to CloudFront
```

**Pros**: Enterprise grade, custom certificates, fine-grained control

### 4.6 Traditional Web Hosting

Upload via FTP/SFTP to any web host:

```bash
# Example with rsync
rsync -avz --exclude='.git' --exclude='node_modules' \
    ./ user@yourhost.com:/var/www/html/arkanoid/
```

**Required**: HTTPS certificate (Let's Encrypt recommended)

---

## 5. Configuration

### 5.1 Environment Variables (Optional)

Create `config.js` for environment-specific settings:

```javascript
// config.js
const CONFIG = {
    // PeerJS Cloud server
    PEERJS_HOST: '0.peerjs.com',
    PEERJS_PORT: 443,
    PEERJS_SECURE: true,
    
    // Debug mode (disable in production)
    DEBUG: false,
    
    // Analytics (optional)
    ANALYTICS_ID: null
};
```

### 5.2 Custom PeerJS Server

For production scale, self-host PeerJS:

```javascript
// config.js
const CONFIG = {
    PEERJS_HOST: 'signaling.yourdomain.com',
    PEERJS_PORT: 9000,
    PEERJS_SECURE: true,
    PEERJS_KEY: 'your-api-key'
};
```

**PeerJS Server Setup**:
```bash
# Install PeerJS server
npm install peer -g

# Run
peerjs --port 9000 --key your-api-key --sslkey key.pem --sslcert cert.pem
```

### 5.3 Content Security Policy

Add to `index.html` `<head>`:

```html
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://unpkg.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    font-src https://fonts.gstatic.com;
    connect-src 'self' wss://*.peerjs.com ws://localhost:*;
    media-src 'self';
">
```

---

## 6. Pre-Deploy Checklist

- [ ] All files included in deployment
- [ ] HTTPS enabled
- [ ] CDN resources load correctly
- [ ] Room code generation works
- [ ] P2P connection establishes
- [ ] Game syncs between devices
- [ ] Mobile layout displays correctly
- [ ] Audio plays after user interaction
- [ ] Performance overlay works (Ctrl+Shift+P)
- [ ] No console errors

---

## 7. Post-Deploy Verification

### 7.1 Connection Test

1. Open game in two browsers/tabs
2. Host creates room (Browser A)
3. Guest joins with code (Browser B)
4. Verify connection dot turns green
5. Play through one level together

### 7.2 Performance Test

1. Open game on target devices
2. Press `Ctrl+Shift+P` for stats
3. Verify 55-60 FPS
4. Check ping is <100ms on same network

### 7.3 Mobile Test

1. Test on iOS Safari and Android Chrome
2. Verify touch controls work
3. Check orientation handling
4. Confirm fullscreen works on Android

---

## 8. Domain & SSL

### 8.1 Custom Domain Setup

**DNS Configuration**:
```
Type: CNAME
Name: arkanoid
Value: cname.vercel-dns.com (or your host)
```

### 8.2 SSL Certificate

Most modern hosts provide free SSL via Let's Encrypt:

- Netlify: Auto-enabled
- Vercel: Auto-enabled
- Cloudflare: Auto-enabled
- GitHub Pages: Auto-enabled

For self-hosted:
```bash
# Let's Encrypt with Certbot
certbot certonly --webroot -w /var/www/html -d arkanoid.yourdomain.com
```

---

## 9. Monitoring

### 9.1 Uptime Monitoring

Free options:
- UptimeRobot: https://uptimerobot.com/
- Pingdom: https://www.pingdom.com/
- StatusCake: https://www.statuscake.com/

### 9.2 Error Tracking (Optional)

```javascript
// Add to main.js for production error tracking
window.onerror = function(msg, url, lineNo, columnNo, error) {
    // Send to your error tracking service
    // Sentry, LogRocket, or custom endpoint
    console.error('Global error:', { msg, url, lineNo, error });
    return false;
};
```

### 9.3 Analytics (Optional)

```javascript
// Simple page view tracking (privacy-friendly)
fetch('/api/analytics', {
    method: 'POST',
    body: JSON.stringify({
        event: 'pageview',
        path: location.pathname,
        device: navigator.userAgent
    })
});
```

---

## 10. Scaling Considerations

### 10.1 Current Limits

| Resource | Limit |
|----------|-------|
| Concurrent games | Unlimited (no server) |
| Players per game | 2 (by design) |
| Bandwidth per game | ~13 GB/month (2hr/day) |
| CDN transfer | Depends on host |

### 10.2 Scaling PeerJS

If using custom PeerJS server:

```bash
# Run multiple instances behind load balancer
peerjs --port 9000 --key prod-key
peerjs --port 9001 --key prod-key
peerjs --port 9002 --key prod-key
```

### 10.3 Cost Estimates

| Traffic | GitHub Pages | Netlify | Vercel | AWS S3+CloudFront |
|---------|--------------|---------|--------|-------------------|
| 1K users/mo | Free | Free | Free | ~$5 |
| 10K users/mo | Free | Free | Free | ~$20 |
| 100K users/mo | Free | Pro ($19) | Pro ($20) | ~$150 |

---

## 11. Rollback Strategy

### 11.1 Version Tagging

```bash
# Tag releases
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# Rollback
git revert HEAD
git push origin main
```

### 11.2 Blue-Green Deployment

For zero-downtime updates on self-hosted:

```bash
# Deploy to 'staging' directory
rsync ./ user@host:/var/www/staging/

# Test staging
# ...

# Swap directories
ssh user@host "mv /var/www/production /var/www/backup && mv /var/www/staging /var/www/production"

# Rollback if needed
ssh user@host "mv /var/www/backup /var/www/production"
```

---

## 12. Troubleshooting

### 12.1 WebRTC Connection Fails

**Symptoms**: Players can't connect, connection dot stays red

**Solutions**:
1. Verify HTTPS is enabled
2. Check firewall allows WebRTC (UDP ports 10000-65535)
3. Test with TURN servers enabled
4. Try manual SDP exchange

### 12.2 High Latency

**Symptoms**: Laggy gameplay, desync messages

**Solutions**:
1. Players should use same geographic region
2. Try different network (5GHz vs 2.4GHz)
3. Check for VPN interference
4. Monitor with performance overlay

### 12.3 Audio Not Playing

**Symptoms**: No sound effects

**Solutions**:
1. User must interact first (click/tap) - browser policy
2. Check browser isn't muted
3. Verify Web Audio API support

---

## 13. Security Checklist

- [ ] HTTPS enforced
- [ ] CSP headers configured
- [ ] No secrets in client code
- [ ] Input validation on all messages
- [ ] Room codes are random and unique
- [ ] No user-generated HTML injection
- [ ] CORS configured if using custom PeerJS

---

## 14. Support

For deployment issues:
1. Check browser console for errors
2. Verify network tab shows all resources loading (200 OK)
3. Test WebRTC at https://webrtc.github.io/samples/
4. File issue with deployment provider

---

## 15. Quick Deploy Commands

```bash
# GitHub Pages
git push origin main

# Netlify CLI
npm install -g netlify-cli
netlify deploy --prod --dir=.

# Vercel CLI
npm install -g vercel
vercel --prod

# AWS S3
aws s3 sync . s3://your-bucket --exclude '.git/*'

# Surge.sh (quick temporary)
npm install -g surge
surge
```

---

**Ready to deploy! 🚀**
