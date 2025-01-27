// Initialize button with user's preferred color
let changeColor = document.getElementById("downloadMp3");

changeColor.addEventListener('click',()=>{
    chrome.tabs.query({active: true, currentWindow: true},function(tabs){

        chrome.runtime.sendMessage({ command: "ytCookies"},
            function(response) {
            console.log(response)
                chrome.tabs.create({url: `https://www.lunuc.com/system/youtube_downloader?preview=true&format=mp3&url=${encodeURIComponent(tabs[0].url)}&cookies=${encodeURIComponent(JSON.stringify(response))}`});
            }
        );
    })


    return false
})
/*chrome.storage.sync.get("color", ({ color }) => {
    changeColor.style.backgroundColor = color;
});*/
