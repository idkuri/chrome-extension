const app = require('express')();
const cors = require('cors');
const puppeteer = require('puppeteer');
const axios = require('axios');
const writer = require('fs');
const path = require('path');
const { exec } = require('child_process');


const PORT = 8080;
app.use(cors());

try {
    writer.mkdirSync(path.join(__dirname, 'm3u8'));
    writer.mkdirSync(path.join(__dirname, 'videos'));
}
catch {
    console.log("Directories already exist")
}

app.listen(
    PORT,
    () => console.log(`it's alive on http://localhost:${PORT}`)
)

app.get('/', (req, res) => {
    res.send("Hello World");
});

app.get('/:id/', (req, res) => {
    const id = req.params.id;
    const filePath = path.join(__dirname, 'videos', id, 'output.mp4');
    
    if (writer.existsSync(filePath)) {
        // Set headers for file download
        res.setHeader('Content-Disposition', `attachment; filename=${id}-output.mp4`);
        res.setHeader('Content-Type', 'video/mp4');
        
        // Stream the file to the client
        const fileStream = writer.createReadStream(filePath);
        fileStream.pipe(res);
        
        // Handle potential errors during streaming
        fileStream.on('error', (err) => {
            console.error('Error while streaming the file:', err);
            res.status(500).send('Internal Server Error');
        });
        
        // End response when the stream finishes
        fileStream.on('end', () => {
            res.end();
        });
    } else {
        res.status(404).send('File not found');
    }
});

const generateUniqueId = () => {
    return Math.random().toString(36).substr(2, 9);
};


const garbageCollector = async (jobID) => {
    setTimeout(async () => {
        try {
            const file_promises = []
            const video_files = writer.readdirSync(path.join(__dirname, 'videos', jobID));
            const m3u8_files = writer.readdirSync(path.join(__dirname, 'm3u8', jobID));
            video_files.map(file => file_promises.push(writer.unlinkSync(path.join(__dirname, 'videos', jobID, file))));
            m3u8_files.map(file => file_promises.push(writer.unlinkSync(path.join(__dirname, 'm3u8', jobID, file))));
            await Promise.all(file_promises);
            writer.rmdirSync(path.join(__dirname, 'videos', jobID));
            writer.rmdirSync(path.join(__dirname, 'm3u8', jobID));
            console.log(`Successfully cleaned up files for job ${jobID}`);
        } 
        catch (err) {
            console.error(`Error cleaning up files for job ${jobID}:`, err);
        }
    }, 10 * 60 * 1000);
};

const captureM3U8 = async (url) => {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
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
    return new Promise((resolve, reject) => {
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
                    reject(err);
                    console.error(`Error writing file ${savedPath}`, err);
                }
                else {
                    resolve(savedPath);
                }
            });
        }).catch((err) => { console.error(`Error downloading ${url}:`, err); });
    });
}

const runFFMPEG = async (url, jobID) => {
    return new Promise((resolve, reject) => {
        const strings = url.split('/')[2].split('.m3u8')[0];
        exec(`ffmpeg -protocol_whitelist file,crypto,data,https,tls,tcp -i ${path.join(__dirname, url)} -c copy ${"videos/" + jobID + "/" + strings}.mp4`, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                console.error(`Error converting ${url} to mp4:`, err);
            }
            console.log(stdout)
            resolve("videos/" + jobID + "/" + strings + ".mp4");
        });

    });
};

const combineMP4 = async (jobID) => { 
    return new Promise((resolve, reject) => {
        let m3u8_files = writer.readdirSync(path.join(__dirname, 'm3u8', jobID));
        let files = writer.readdirSync(path.join(__dirname, 'videos', jobID));
        let m3u8_map = {video: null, audio: null};
        let map = {video: null, audio: null};
        for (let i = 0; i < m3u8_files.length; i++) {
            let type = m3u8_files[i].split("_")
            if (type[0] === "video") {
                m3u8_map.video = m3u8_files[i];
            }
            else if (type[0] === "audio") {
                m3u8_map.audio = m3u8_files[i];
            }
        }
        for (let i = 0; i < files.length; i++) {
            let type = files[i].split("_")
            if (type[0] === "video") {
                map.video = files[i];
            }
            else if (type[0] === "audio") {
                map.audio = files[i];
            }
        }
        if (m3u8_map.audio === null && m3u8_map.video && map.video) {
            exec(`ffmpeg -i ${path.join(__dirname, 'videos', jobID, `${map.video}`)} -c copy ${path.join(__dirname, 'videos', jobID, 'output.mp4')}`, (err, stdout, stderr) => {
                if (err) {
                    console.error(`Error combining video`, err);
                    reject(err);
                    return;
                }
                console.log(stdout);
                resolve();
            });
        }
        else if (m3u8_map.video && map.video && m3u8_map.audio && map.audio) {
            exec(`ffmpeg -i ${path.join(__dirname, 'videos', jobID, `${map.video}`)} -i ${path.join(__dirname, 'videos', jobID, `${map.audio}`)} -c copy ${path.join(__dirname, 'videos', jobID, 'output.mp4')}`, (err, stdout, stderr) => {
                if (err) {
                    console.error(`Error combining video and audio:`, err);
                    reject(err);
                    return;
                }
                console.log(stdout);
                resolve();
            });

        }
    })
};

app.post('/download', async (req, res) => {
    const link = req.query.url; // Extract URL from query parameters
    if (!link) {
        return res.status(400).send('Missing URL parameter');
    }

    const jobID = generateUniqueId();
    console.log(`Starting download job ${jobID}`);
    while (writer.existsSync(path.join(__dirname, 'm3u8', jobID))) {
        jobID = generateUniqueId();
    }
    writer.mkdirSync(path.join(__dirname, 'm3u8', jobID));
    writer.mkdirSync(path.join(__dirname, 'videos', jobID));
    captureM3U8(link)
        .then((result) => {
            const urls = [];
            for (let i = 0; i < result.length; i++) {
                urls.push(downloadM3U8(result[i], jobID))
            }
            return Promise.all(urls);
        }).then((result) => {
            const m3u8Promises = [];
            for (let i = 0; i < result.length; i++) {
                m3u8Promises.push(runFFMPEG(result[i], jobID));
            }
            return Promise.all(m3u8Promises);
        }).then(() => {
            combineMP4(jobID).then(() => {
                const filePath = path.join(__dirname, 'videos', jobID, 'output.mp4');
    
                if (writer.existsSync(filePath)) {
                    // Set headers for file download
                    res.setHeader('Content-Disposition', `attachment; filename=${jobID}-output.mp4`);
                    res.setHeader('Content-Type', 'video/mp4');
                    
                    // Stream the file to the client
                    const fileStream = writer.createReadStream(filePath);
                    fileStream.pipe(res);
                    
                    // Handle potential errors during streaming
                    fileStream.on('error', (err) => {
                        console.error('Error while streaming the file:', err);
                        res.status(500).send('Internal Server Error');
                    });
                    
                    // End response when the stream finishes
                    fileStream.on('end', () => {
                        res.end();
                    });
                } else {
                    res.status(404).send('File not found');
                }
                garbageCollector(jobID);
            });
        })
        .catch((error) => {
            console.error(error);
            res.status(500).send('An error occurred');
        });
});
