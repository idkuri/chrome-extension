document.addEventListener("DOMContentLoaded", async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const url = tabs[0].url;
        document.getElementById("url").textContent = url;
    });
});
