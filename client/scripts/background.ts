chrome.action.onClicked.addListener((tab) => {
    console.log("Current URL:", tab.url);
});
