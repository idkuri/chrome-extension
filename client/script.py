import requests

base_url = "https://video.twimg.com"
segments = [
    "/ext_tw_video/1887210355556032512/pu/aud/mp4a/0/3000/128000/EiiSOawk-pbRcfox.m4s",
    "/ext_tw_video/1887210355556032512/pu/aud/mp4a/3000/6000/128000/SM0Razzj7fOJ590G.m4s",
    "/ext_tw_video/1887210355556032512/pu/aud/mp4a/6000/9000/128000/wqL6GbcDeh5HiJRb.m4s",
]

with open("video.mp4", "wb") as output_file:
    for segment in segments:
        response = requests.get(base_url + segment, stream=True)
        if response.status_code == 200:
            output_file.write(response.content)
