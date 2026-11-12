"""Render 3D shots from the real KeyShot GLB with Eevee.

Y-up joint math matches src/product/arm.ts. Blender is Z-up, so deltas are
converted with (x, y, z) -> (x, -z, y) before they move the imported empties.
The 148MB source stays outside git. This script only reads it.
"""
import bpy, json, os, sys
from math import cos, radians, sin
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def flag(name, default=None):
    if name in argv:
        return argv[argv.index(name) + 1]
    return default

anim_path = flag('--anim')
out_dir = flag('--out', 'output/plates')
glb = flag('--glb', os.environ.get('PREVIS_ARM_GLB', 'models/cybopal-arm.glb'))
probe = '--probe' in argv
only = [int(v) for v in flag('--frames', '').split(',') if v]
os.makedirs(out_dir, exist_ok=True)

with open(anim_path) as handle:
    anim = json.load(handle)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

PARTS = {
    'base': '底座',
    'seg1': '第一段旋转机械臂',
    'seg2': '第二段旋转机械臂',
    'seg3': '第三段旋转机械臂',
    'seg4': '第四段段旋转机械臂-v2',
    'seg5': '第五段段旋转机械臂-v2',
    'bracket': '显示器固定支架',
    'display': 'Studio Display',
}

def find_part(label):
    for obj in bpy.data.objects:
        if obj.name == label and obj.parent and obj.parent.name == '移动机械臂':
            return obj
    raise SystemExit(f'GLB 里没有部件 {label}')

parts = {key: find_part(label) for key, label in PARTS.items()}
rest = {key: obj.matrix_world.copy() for key, obj in parts.items()}
arm = bpy.data.objects['移动机械臂']
origin = arm.matrix_world.translation.copy()

for obj in bpy.data.objects:
    if obj.name.startswith('办公桌') or obj.name.startswith('Mac Studio') or obj.name.startswith('TYPE-C') or obj.type == 'CAMERA':
        obj.hide_render = True
        obj.hide_set(True)

def principled(name, color, metallic, roughness, anisotropic=0.0, emission=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    if 'Anisotropic' in node.inputs:
        node.inputs['Anisotropic'].default_value = anisotropic
    if emission and 'Emission Strength' in node.inputs:
        node.inputs['Emission Color'].default_value = (*color, 1)
        node.inputs['Emission Strength'].default_value = emission
    return material

brushed = principled('brushed-aluminium', (0.78, 0.79, 0.80), 1.0, 0.32, 0.65)
black = principled('matte-black', (0.015, 0.016, 0.018), 0.15, 0.55)
dark_metal = principled('dark-metal', (0.22, 0.23, 0.24), 0.85, 0.38, 0.35)
glass = principled('display-glass', (0.02, 0.025, 0.03), 0.0, 0.08, emission=0.4)
status_mat = principled('base-status', (0.15, 0.85, 0.75), 0.0, 0.4, emission=8.0)

def bounds_size(obj):
    points = [Vector(corner) for corner in obj.bound_box]
    span = [max(point[axis] for point in points) - min(point[axis] for point in points) for axis in range(3)]
    return min(span), max(span)

for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    thin, wide = bounds_size(obj)
    if 'Studio Display' in obj.name and thin < 0.004 and wide > 0.2:
        obj.data.materials.clear(); obj.data.materials.append(glass)
    elif obj.name.startswith('底座'):
        obj.data.materials.clear(); obj.data.materials.append(black)
    elif obj.name.startswith('显示器固定支架') or obj.name.startswith('手拧螺母'):
        obj.data.materials.clear(); obj.data.materials.append(dark_metal)
    elif not obj.hide_render:
        obj.data.materials.clear(); obj.data.materials.append(brushed)

for image in list(bpy.data.images):
    bpy.data.images.remove(image)

status_curve = bpy.data.curves.new('status', 'FONT')
status_curve.body = 'Working'
status_curve.size = 0.006
status_curve.align_x = 'CENTER'
status_curve.align_y = 'CENTER'
status = bpy.data.objects.new('status', status_curve)
bpy.context.scene.collection.objects.link(status)
status.parent = parts['base']
status.location = (0.086, 0.0, 0.012)
status.rotation_euler = (radians(90), 0, radians(90))
status.data.materials.append(status_mat)
screen = bpy.data.meshes.new('base-screen')
screen.from_pydata([(-0.03, -0.012, 0), (0.03, -0.012, 0), (0.03, 0.012, 0), (-0.03, 0.012, 0)], [], [(0, 1, 2, 3)])
screen_obj = bpy.data.objects.new('base-screen', screen)
bpy.context.scene.collection.objects.link(screen_obj)
screen_obj.parent = parts['base']
screen_obj.location = (0.08, 0.0, 0.01)
screen_obj.rotation_euler = (radians(90), 0, radians(90))
screen_obj.data.materials.append(status_mat)

C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CINV = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))

def normalize(axis):
    length = (axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2) ** 0.5 or 1
    return [axis[0] / length, axis[1] / length, axis[2] / length]

def hinge(pivot, axis, degrees):
    x, y, z = normalize(axis)
    angle = radians(degrees)
    c, s = cos(angle), sin(angle)
    one = 1 - c
    rotation = Matrix((
        (c + x * x * one, x * y * one - z * s, x * z * one + y * s, 0),
        (y * x * one + z * s, c + y * y * one, y * z * one - x * s, 0),
        (z * x * one - y * s, z * y * one + x * s, c + z * z * one, 0),
        (0, 0, 0, 1),
    ))
    return Matrix.Translation(Vector(pivot)) @ rotation @ Matrix.Translation(-Vector(pivot))

joints = {joint['id']: joint for joint in anim['joints']}

def ordered(ids):
    done, result = set(), []
    def visit(joint_id):
        if joint_id in done or joint_id not in joints:
            return
        parent = joints[joint_id].get('parentId')
        if parent:
            visit(parent)
        done.add(joint_id)
        result.append(joints[joint_id])
    for joint_id in ids:
        visit(joint_id)
    return result

def combined(part_id, angles):
    affecting = []
    for joint in joints.values():
        if part_id in joint['affects']:
            current = joint['id']
            while current:
                if current not in affecting:
                    affecting.append(current)
                current = joints[current].get('parentId')
    matrix = Matrix.Identity(4)
    for joint in ordered(affecting):
        delta = (angles.get(joint['id'], joint['restAngle']) - joint['restAngle'])
        matrix = matrix @ hinge(joint['pivot'], joint['axis'], delta)
    converted = C @ matrix @ CINV
    return Matrix.Translation(origin) @ converted @ Matrix.Translation(-origin)

def apply_sample(sample):
    angles = sample['angles']
    for part_id, obj in parts.items():
        obj.matrix_world = combined(part_id, angles) @ rest[part_id]
    camera = sample['camera']
    position = Vector((camera['position'][0], -camera['position'][2], camera['position'][1]))
    target = Vector((camera['target'][0], -camera['target'][2], camera['target'][1]))
    cam.location = position
    cam.rotation_euler = (target - position).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = camera['focalLength']
    cam.data.dof.focus_distance = max(0.05, camera.get('focusDistance') or (target - position).length)
    cam.data.dof.aperture_fstop = camera.get('aperture') or 2.8
    status_curve.body = sample.get('text') or ''

def key_all(frame):
    for obj in parts.values():
        obj.keyframe_insert('location', frame=frame)
        obj.keyframe_insert('rotation_euler', frame=frame)
        obj.keyframe_insert('scale', frame=frame)
    cam.keyframe_insert('location', frame=frame)
    cam.keyframe_insert('rotation_euler', frame=frame)
    cam.data.dof.keyframe_insert('focus_distance', frame=frame)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 16
scene.eevee.use_bloom = True
scene.eevee.bloom_intensity = 0.06
scene.eevee.bloom_threshold = 0.85
scene.render.use_motion_blur = True
scene.render.motion_blur_shutter = 0.35
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.resolution_percentage = 100
scene.render.fps = anim.get('fps', 24)
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new('black') if scene.world is None else scene.world
scene.world.use_nodes = True
background = scene.world.node_tree.nodes.get('Background')
if background:
    background.inputs[0].default_value = (0, 0, 0, 1)
    background.inputs[1].default_value = 0

def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()

def add_light(name, location, energy, size, color):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy
    light.size = size
    light.color = color
    obj = bpy.data.objects.new(name, light)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = Vector(location)
    look_at(obj, Vector((-0.05, 0.0, 1.15)))
    return obj

add_light('key', (-0.4, -1.8, 2.4), 250, 1.4, (1, 0.97, 0.93))
add_light('rim-cool', (1.5, 1.2, 1.9), 600, 0.6, (0.65, 0.82, 1))
add_light('rim-warm', (-1.8, 0.4, 1.5), 380, 0.5, (1, 0.78, 0.62))

floor_mesh = bpy.data.meshes.new('floor')
floor_mesh.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
floor = bpy.data.objects.new('floor', floor_mesh)
bpy.context.scene.collection.objects.link(floor)
floor.location = (0, 0, 0.768)
mirror = principled('floor', (0.01, 0.01, 0.012), 1.0, 0.18)
floor.data.materials.append(mirror)

cam_data = bpy.data.cameras.new('shot')
cam_data.sensor_width = 36
cam_data.dof.use_dof = True
cam = bpy.data.objects.new('shot', cam_data)
bpy.context.scene.collection.objects.link(cam)
scene.camera = cam
cam.data.clip_start = 0.02
cam.data.clip_end = 40

samples = anim['samples']
if only:
    wanted = set(only)
    samples = [sample for sample in samples if sample['f'] in wanted]
elif probe:
    chosen = []
    seen = {}
    for sample in anim['samples']:
        seen.setdefault(sample['shot'], []).append(sample)
    for group in seen.values():
        chosen.append(group[0])
        if group[-1]['f'] != group[0]['f']:
            chosen.append(group[-1])
    samples = chosen

for sample in samples:
    apply_sample(sample)
    key_all(sample['f'])

def render_frame(frame):
    scene.frame_set(frame)
    path = os.path.join(out_dir, f'{frame:04d}.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('rendered', path, flush=True)
    return path

for sample in samples:
    render_frame(sample['f'])

def load_score(path_a, path_b):
    image_a = bpy.data.images.load(path_a)
    image_b = bpy.data.images.load(path_b)
    pixels_a, pixels_b = image_a.pixels[:], image_b.pixels[:]
    seen = visible = changed = 0
    for index in range(0, min(len(pixels_a), len(pixels_b)) - 4, 16 * 4):
        seen += 1
        brightness = pixels_a[index] + pixels_a[index + 1] + pixels_a[index + 2]
        if brightness > 0.12:
            visible += 1
        delta = abs(pixels_a[index] - pixels_b[index]) + abs(pixels_a[index + 1] - pixels_b[index + 1]) + abs(pixels_a[index + 2] - pixels_b[index + 2])
        if delta > 0.18:
            changed += 1
    bpy.data.images.remove(image_a)
    bpy.data.images.remove(image_b)
    return {'visible': visible / seen if seen else 0, 'changed': changed / seen if seen else 0}

if probe:
    groups = {}
    for sample in samples:
        groups.setdefault(sample['shot'], []).append(sample)
    report = []
    failed = False
    for shot, group in groups.items():
        start, end = group[0], group[-1]
        score = load_score(os.path.join(out_dir, f"{start['f']:04d}.png"), os.path.join(out_dir, f"{end['f']:04d}.png"))
        notes = []
        if score['visible'] < 0.02:
            notes.append('产品几乎不在画面里')
        if start.get('motion') and start['f'] != end['f'] and score['changed'] < 0.035:
            notes.append('动作在像素上不明显')
        if notes:
            failed = True
        report.append({'shot': shot, 'frames': [start['f'], end['f']], **score, 'notes': notes})
        print(shot, score, notes, flush=True)
    with open(os.path.join(out_dir, 'probe-score.json'), 'w') as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    if failed:
        raise SystemExit(2)
