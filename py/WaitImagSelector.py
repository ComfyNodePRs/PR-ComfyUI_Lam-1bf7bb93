import folder_paths
from nodes import SaveImage
import random
from PIL import Image, ImageOps
import os
import numpy as np
import json
from PIL.PngImagePlugin import PngInfo
from comfy.cli_args import args
from server import PromptServer
from .src.utils.chooser import ChooserMessage, ChooserCancelled


class WaitImagSelector(SaveImage):
    def __init__(self):
        self.output_dir = folder_paths.get_temp_directory()
        self.type = "temp"
        self.prefix_append = "_temp_" + \
            ''.join(random.choice("abcdefghijklmnopqrstupvxyz")
                    for x in range(5))
        self.compress_level = 1

    @classmethod
    def INPUT_TYPES(s):
        return {"required":
                {"images": ("IMAGE", ), },
                "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID"},
                }

    RETURN_TYPES = ("BOOL","IMAGE",)
    RETURN_NAMES = ("是否没选","选择图片",)
    FUNCTION = "save_images"
    CATEGORY = "image"
    OUTPUT_NODE = True

    last_ic = {}
    @classmethod
    def IS_CHANGED(cls, unique_id, **kwargs):
        return cls.last_ic[unique_id.split(".")[-1]]

    def save_images(self, images, filename_prefix="ComfyUI", prompt=None, extra_pnginfo=None, unique_id=None):
        id = unique_id.split(".")[-1]
        if id not in ChooserMessage.stash:
            ChooserMessage.stash[id] = {}
            my_stash = ChooserMessage.stash[id]

        filename_prefix += self.prefix_append
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(
            filename_prefix, self.output_dir, images[0].shape[1], images[0].shape[0])
        results = list()
        for (batch_number, image) in enumerate(images):
            i = 255. * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))
            metadata = None
            if not args.disable_metadata:
                metadata = PngInfo()
                if prompt is not None:
                    metadata.add_text("prompt", json.dumps(prompt))
                if extra_pnginfo is not None:
                    for x in extra_pnginfo:
                        metadata.add_text(x, json.dumps(extra_pnginfo[x]))

            filename_with_batch_num = filename.replace(
                "%batch_num%", str(batch_number))
            file = f"{filename_with_batch_num}_{counter:05}_.png"
            img.save(os.path.join(full_output_folder, file),
                     pnginfo=metadata, compress_level=self.compress_level)
            results.append({
                "filename": file,
                "subfolder": subfolder,
                "type": self.type
            })
            counter += 1
        PromptServer.instance.send_sync(
            "lam-wait-image-select", {"id": id, "urls": results})
        try:
            selections = ChooserMessage.waitForMessage(id, asList=True)
            if len(selections)==1 and selections[0]==-1:
                return {"ui": {"images": results},"result": (True,None,)}
            selImgs = images[selections[:-1]]
            return {"ui": {"images": results},"result": (False,selImgs,)}
        except ChooserCancelled:
            return {"ui": {"images": results},"result": (True,None,)}



NODE_CLASS_MAPPINGS = {
    "WaitImagSelector": WaitImagSelector
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "WaitImagSelector": "等待图片选择器"
}