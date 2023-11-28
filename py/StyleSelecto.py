import server
from aiohttp import web
import os
import json


dir = os.path.abspath(os.path.join(__file__, "../../styles"))
if not os.path.exists(dir):
    os.mkdir(dir)

@server.PromptServer.instance.routes.get("/lam/getStyles")
def getStyles(request):
    if "name" in request.rel_url.query:
        name = request.rel_url.query["name"]
        file = os.path.join(dir, name+'.json')
        zhFile = os.path.join(dir, 'zh_CN.json')
        if os.path.isfile(zhFile):
            f = open(zhFile,'r', encoding='utf-8')
            zhData = json.load(f)
            f.close()

        if os.path.isfile(file):
            f = open(file,'r', encoding='utf-8')
            data = json.load(f)
            f.close()
            if data:
                ndata=[]
                if zhData:
                    for d in data:
                        nd={}
                        name=d['name'].replace('-',' ')
                        words=name.split(' ')
                        key=' '.join(word.upper() if word in ['mre','sai'] else word.capitalize() for word in words)
                        nd['zhName']=zhData[key] if key in zhData else key
                        nd["name"]=d['name']
                        ndata.append(nd)
                return web.json_response(ndata)
    return web.Response(status=404)

class StyleSelecto:
    """
    提示词选择工具
    """
    def __init__(self):
        dir = os.path.abspath(os.path.join(__file__, "../../styles"))
        if not os.path.exists(dir):
            os.mkdir(dir)
        self.dir=dir
    
    @classmethod
    def INPUT_TYPES(self):
        dir = os.path.abspath(os.path.join(__file__, "../../styles"))
        #获取目录全部yml文件名
        files_name=[]
        for root, dirs, files in os.walk(dir):
            for file in files:
                if file.endswith(".json") and file.split(".")[0].find("styles")!=-1:
                    files_name.append(file.split(".")[0])

        return {
            "required": {
                "prompt": ("STRING", {"forceInput": True}),
                "style_type":(files_name, ),

            },
            "optional": {
                "negative_prompt":("STRING",{"forceInput": True}),
            },
            "hidden": {"extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("STRING","STRING",)
    RETURN_NAMES = ("正向提示词","反向提示词",)

    FUNCTION = "translate"

    #OUTPUT_NODE = False

    CATEGORY = "lam"

    def translate(self,prompt,style_type,extra_pnginfo, unique_id,negative_prompt=""):
        values = []
        for node in extra_pnginfo["workflow"]["nodes"]:
            if node["id"] == int(unique_id):
                values = node["properties"]["values"]
                break
        print(values,'================')
        for root, dirs, files in os.walk(self.dir):
            for file in files:
                if file.endswith(".json") and file.split(".")[0].find("styles")!=-1:
                    f = open(os.path.join(root, file), 'r', encoding='utf-8')
                    data = json.load(f)
                    f.close()
                    for d in data:
                        if d['name'] in values:
                            prompt=d['prompt'].format(prompt=prompt)
                            negative_prompt+=','+d['negative_prompt']
                            break
        print(prompt,'================',negative_prompt)

        return (prompt,negative_prompt)

# A dictionary that contains all nodes you want to export with their names
# NOTE: names should be globally unique
NODE_CLASS_MAPPINGS = {
    "StyleSelecto": StyleSelecto
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "StyleSelecto": "风格选择器"
}
