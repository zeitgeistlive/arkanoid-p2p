const puppeteer = require('puppeteer');
const roomCode = process.argv[2];
if (!roomCode) {
    console.error("No room code provided");
    process.exit(1);
}

(async () => {
    console.log(`[P2] Starting headless browser to join room ${roomCode}...`);
    const b = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const p = await b.newPage();
    await p.goto('https://zeitgeistlive.github.io/arkanoid-p2p/?v=7', {waitUntil: 'load'});

    // Bypass tutorial and click JOIN ROOM
    await p.evaluate(() => {
        document.querySelectorAll('.modal, .overlay, #tutorial-overlay').forEach(e => e.remove());
        const joinBtn = document.getElementById('btn-join-room');
        if(joinBtn) joinBtn.click();
    });

    await new Promise(r => setTimeout(r, 1000));

    // Enter code and connect
    await p.evaluate((code) => {
        const input = document.getElementById('room-code-input');
        if(input) {
            input.value = code;
            const connBtn = document.getElementById('btn-connect');
            if(connBtn) connBtn.click();
        }
    }, roomCode);

    console.log("[P2] Sent connection request. Waiting for game start...");
    
    // Simulate player 2 behavior
    let steps = 0;
    const interval = setInterval(async () => {
        // Press space to start/launch ball
        await p.keyboard.press('Space');
        // Move paddle a bit
        if (steps % 2 === 0) await p.keyboard.down('ArrowLeft');
        else await p.keyboard.up('ArrowLeft');
        steps++;
    }, 1000);
    
    // Keep alive for 40 seconds, then exit
    await new Promise(r => setTimeout(r, 40000));
    clearInterval(interval);
    await b.close();
    console.log("[P2] Finished playing and exited.");
})();