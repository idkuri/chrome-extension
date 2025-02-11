const app = require('express')();
const PORT = 8080;
const puppeteer = require('puppeteer');
const axios = require('axios');
const writer = require('fs');
const path = require('path');
const { exec } = require('child_process');

app.listen(
    PORT,
    () => console.log(`it's alive on http://localhost:${PORT}`)
)

app.get('/', (req, res) => {
    res.send("Hello World");
});

const generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9); // You can customize this for longer or more secure IDs
};

const captureM3U8 = async (url) => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    let checkUrl = []
  
    page.on('response', async (response) => {
      const responseUrl = response.url();
      if (responseUrl.endsWith(".m3u8")) {
        checkUrl.push(responseUrl);
      }
    });
  
    await page.goto(url, { waitUntil: 'networkidle2' });
  
    await browser.close();
    return checkUrl
  };


const downloadM3U8 = async (url, jobID) => {
    const strings = url.split('/');
    let type = "";
    axios.get(url).then((response) => {
        const lines = response.data.split('\n').map(line => {
            if (line.startsWith('/ext_tw_video') || line.startsWith('/amplify_video')) {
                return 'https://video.twimg.com' + line.split('.m4s')[0] + '.mp4';
            }
            else if(line.startsWith('#EXT-X-MAP')) {
                return '#EXT-X-MAP:URI="https://video.twimg.com' + line.split('URI="')[1];
            }
            return line;
        });
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith('https://video.twimg.com')) {
                temp = lines[i].split('/')
                for (let idx = 0; idx < temp.length; idx++) {
                    if (temp[idx] === 'aud') {
                        type = "audio";
                    }
                    else if (temp[idx] === 'vid') {
                        type = "video";
                    }
                }
            }
        }
        const updatedData = lines.join('\n');
        const savedPath = `m3u8/${jobID}/${type + "_" + strings[strings.length - 1]}`;
        writer.writeFile(path.join(__dirname, savedPath), updatedData, (err) => {
            if (err) {
                console.error(`Error writing file ${savedPath}`, err);
            }
            else {
                runFFMPEG(savedPath, jobID);
            }
        });
    }).catch((err) => { console.error(`Error downloading ${url}:`, err); });
    // return `m3u8/${jobID}/${type + "_" + strings[strings.length - 1]}`;
}

const runFFMPEG = async (url, jobID) => {
    const strings = url.split('/')[2].split('.m3u8')[0];
    exec(`ffmpeg -protocol_whitelist file,crypto,data,https,tls,tcp -i ${path.join(__dirname, url)} -c copy ${"videos/" + jobID + "/" + strings}.mp4`, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error converting ${url} to mp4:`, err);
            return;
        }
        else {
            const files = writer.readdirSync(path.join(__dirname, 'videos', jobID));
            console.log(files)
        }
    });
};

const combineMP4 = async (jobID) => { 
    exec(`ffmpeg -i ${path.join(__dirname, 'videos', jobID, 'video.m4s')} -i ${path.join(__dirname, 'videos', jobID, 'audio.m4s')} -c copy ${path.join(__dirname, 'videos', jobID, 'output.mp4')}`, (err, stdout, stderr) => {
        if (err) {
            console.error(`Error combining video and audio:`, err);
            return;
        }
        console.log(stdout);
    });
};

app.post('/download', (req, res) => {
    const link = req.query.url; // Extract URL from query parameters
    if (!link) {
        return res.status(400).send('Missing URL parameter');
    }

    const jobID = generateUniqueId();
    while (writer.existsSync(path.join(__dirname, 'm3u8', jobID))) {
        jobID = generateUniqueId();
    }
    writer.mkdirSync(path.join(__dirname, 'm3u8', jobID));
    writer.mkdirSync(path.join(__dirname, 'videos', jobID));
    captureM3U8(link)
        .then((result) => {
            for (let i = 0; i < result.length; i++) {
                downloadM3U8(result[i], jobID)
            }
            res.send(result);
        })
        .catch((error) => {
            console.error(error);
            res.status(500).send('An error occurred');
        });
});
