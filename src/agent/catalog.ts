/** The only commands an agent is allowed to send. Higher-level tools compile down to this list. */
export const COMMAND_CATALOG = [
  {type: 'project.update', summary: '改名称、时长、宽高。'},
  {type: 'asset.add', summary: '登记一个已经放进项目目录的资源。'},
  {type: 'object.add', summary: '添加模型、人物、方块、屏幕或灯。'},
  {type: 'object.update', summary: '改一个对象的变换、可见性或屏幕。'},
  {type: 'object.remove', summary: '删除对象及其轨道。'},
  {type: 'rig.set', summary: '设置关节链：轴心、轴向、限位、影响的部件。'},
  {type: 'shot.add', summary: '添加镜头。kind 为 3d 或 broll-code。'},
  {type: 'shot.update', summary: '改镜头时间、描述、机位或 B-roll。'},
  {type: 'shot.remove', summary: '删除镜头。'},
  {type: 'track.set', summary: '写入整条属性轨道。'},
  {type: 'track.remove', summary: '删除轨道。'},
  {type: 'keyframe.set', summary: '设置或替换某一帧的关键帧。'},
  {type: 'film.set', summary: '设置影片：风格 brand/creator、影调、BPM、一句话。'},
  {type: 'sequence.add', summary: '添加段落。'},
  {type: 'sequence.update', summary: '改段落。'},
  {type: 'sequence.remove', summary: '删除段落。'},
  {type: 'audio.set', summary: '把一条音频资源接到时间线上。'},
  {type: 'arm.action', summary: '机械臂动作：hold unfold fold rise lower follow-face portrait landscape nod cable-tuck。'},
  {type: 'camera.apply', summary: '用命名运镜和构图预设求解机位，不手填米数。'},
  {type: 'timeline.align', summary: '按 BPM 或检测到的节拍重排切点和关键帧。'},
] as const;

export const MOVE_CATALOG = ['slow-pull', 'slow-push', 'locked', 'orbit', 'crane', 'macro', 'handheld', 'over-shoulder', 'fly-along', 'macro-orbit', 'whip', 'push-impact', 'rack-focus'];
export const COMPOSITION_CATALOG = ['centered', 'macro', 'side', 'front', 'angle45', 'low', 'top', 'over-shoulder'];
