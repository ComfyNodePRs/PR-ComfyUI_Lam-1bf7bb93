import logging

from custom_nodes.ComfyUI_Lam.lama.saicinpainting.training.visualizers.directory import DirectoryVisualizer
from custom_nodes.ComfyUI_Lam.lama.saicinpainting.training.visualizers.noop import NoopVisualizer


def make_visualizer(kind, **kwargs):
    logging.info(f'Make visualizer {kind}')

    if kind == 'directory':
        return DirectoryVisualizer(**kwargs)
    if kind == 'noop':
        return NoopVisualizer()

    raise ValueError(f'Unknown visualizer kind {kind}')
