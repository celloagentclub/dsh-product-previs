import bpy, os
from mathutils import Vector
path = os.environ.get('GLB', '/tmp/models/cybopal-arm.glb')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)
print('EEVEE bloom', hasattr(bpy.context.scene.eevee, 'use_bloom'))
print('objects', len(bpy.data.objects), 'meshes', len(bpy.data.meshes), 'images', len(bpy.data.images))
tris = 0
for mesh in bpy.data.meshes:
    tris += sum(len(p.vertices) - 2 for p in mesh.polygons)
print('triangles', tris)
for obj in bpy.data.objects:
    if obj.type != 'MESH':
        print('NODE', obj.type, obj.name)
        continue
    bb = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    xs = [p.x for p in bb]; ys = [p.y for p in bb]; zs = [p.z for p in bb]
    print(f'MESH {obj.name} parent={obj.parent.name if obj.parent else "-"} '
          f'loc=({obj.matrix_world.translation.x:.3f},{obj.matrix_world.translation.y:.3f},{obj.matrix_world.translation.z:.3f}) '
          f'size=({max(xs)-min(xs):.3f},{max(ys)-min(ys):.3f},{max(zs)-min(zs):.3f}) polys={len(obj.data.polygons)}')
for img in bpy.data.images:
    print('IMG', img.name, img.size[0], img.size[1], img.packed_file is not None)
