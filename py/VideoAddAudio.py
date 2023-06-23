import folder_paths
import cv2
import os
import torch
import numpy as np
from ffmpy import FFmpeg

class VideoAddAudio:
    def __init__(self):
        self.output_dir = os.path.join(folder_paths.get_output_directory(), 'video')
        if not os.path.exists(self.output_dir):
            os .makedirs(self.output_dir)
    @classmethod
    def INPUT_TYPES(s):
        return {"required":
                    {
                        "videoPath": ("STRING", {"default": ""}),
                        "audioPath": ("STRING", {"default": ""}),
                        "filename_prefix": ("STRING", {"default": "comfyUI"}),
                    },
                }

    CATEGORY = "lam"
    RETURN_TYPES = ()
    FUNCTION = "video_add_audio"
    OUTPUT_NODE = True

    def video_add_audio(self, videoPath,audioPath,filename_prefix):
        _ext_video = os.path.basename(videoPath).strip().split('.')[-1]
        _ext_audio = os.path.basename(audioPath).strip().split('.')[-1]
        if _ext_audio not in ['mp3', 'wav']:
            raise Exception('audio format not support')
        _codec = 'copy'
        if _ext_audio == 'wav':
            _codec = 'aac'
        full_output_folder, filename, counter, subfolder, filename_prefix = folder_paths.get_save_image_path(filename_prefix, self.output_dir)
        file = f"{filename}_{counter:05}_.mp4"
        result=os.path.join(full_output_folder, file)
        ff = FFmpeg(
            inputs={videoPath: None, audioPath: None},
            outputs={result: '-map 0:v -map 1:a -c:v copy -c:a {} -shortest'.format(_codec)})
        ff.run()
        return {"ui": {"text": "视频插入音频成功，保存路径："+result}}

NODE_CLASS_MAPPINGS = {
    "VideoAddAudio": VideoAddAudio
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "VideoAddAudio": "视频插入音频"
}
