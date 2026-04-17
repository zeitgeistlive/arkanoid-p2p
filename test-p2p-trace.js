const puppeteer = require('puppeteer');
const wait = (ms) => new Promise(res => setTimeout(res, ms));

async function testP2P() {
    console.log("Starting debug run...");
    const b1 = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    const b2 = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
    
    const p1 = await b1.newPage();
    const p2 = await b2.newPage();
    
    const url = 'file://' + process.cwd() + '/index.html';
    
    p1.on('console', msg => console.log('P1 LOG:', msg.text(), msg.location().url, msg.location().lineNumber));
    p2.on('console', msg => console.log('P2 LOG:', msg.text()));
    
    console.log("P1: Setup...");
    await p1.goto(url, { waitUntil: 'load' });
    await wait(1000);
    await p1.evaluate(() => {
        document.querySelectorAll('.modal, .overlay, #tutorial-overlay').forEach(e => e.remove());
        document.getElementById('btn-create-room').click();
    });
    await wait(500);
    await p1.evaluate(() => document.getElementById('btn-generate-code').click());
    await wait(1000);
    const roomCode = await p1.evaluate(() => document.getElementById("generated-code").textContent.trim());
    console.log("P1 CODE:", roomCode);

    console.log("P2: Setup & Connect...");
    await p2.goto(url, { waitUntil: 'load' });
    await wait(1000);
    await p2.evaluate((code) => {
        document.querySelectorAll('.modal, .overlay, #tutorial-overlay').forEach(e => e.remove());
        document.getElementById('btn-join-room').click();
        
        setTimeout(() => {
            document.getElementById('room-code-input').value = code;
            document.getElementById('btn-connect').click();
        }, 500);
    }, roomCode);
    
    await wait(4000); // give it time to fail/log
    
    console.log("Checking UI connection text...");
    const p1Status = await p1.evaluate(() => document.getElementById("connection-text") ? document.getElementById("connection-text").textContent : 'none');
    const p2Status = await p2.evaluate(() => document.getElementById("connection-text") ? document.getElementById("connection-text").textContent : 'none');
    console.log("P1 STATUS:", p1Status);
    console.log("P2 STATUS:", p2Status);

    await b1.close();
    await b2.close();
}

testP2P().catch(e => {
    console.error("Critical failure:", e);
    process.exit(1);
});
