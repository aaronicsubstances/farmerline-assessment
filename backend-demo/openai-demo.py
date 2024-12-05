import requests

myurl = 'https://api.openai.com/v1/audio/transcriptions'
values = {'model': 'whisper-1'}
auth={'Authorization': f'Bearer {OPENAI_API_KEY}'}

def example1():
    files = {'file': open('speech.wav', 'rb')}
    getdata = requests.post(myurl, files=files, data=values, headers=auth)
    print(getdata.text)

def example2():
    with open('speech.wav', 'rb') as f:
        data = f.read()
    files = {'file': ('speech.wav', data)}
    getdata = requests.post(myurl, files=files, data=values, headers=auth)
    print(getdata.text)

example2()