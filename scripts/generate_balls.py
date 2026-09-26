"""
PoolPoker Ball Generation Pipeline
Generates 3D UV Albedo textures (1024x512) and 2D beauty renders (256x256)
for both 'xingpai' and 'xingjue' ball configurations using Blender.
"""

import bpy
import math
import os

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "balls")
FONT_DIN = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
FONT_ARIAL = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

THEMES = {
    "xingpai": {
        "font": FONT_ARIAL,
        "style": "classic",  # Ivory disc on solids, numbers directly on striped balls' white caps
        "stripe_axis": "Y",  # Number projection faces +/-Y: both numbers sit on white caps
        "stripe_half_width": 0.56,
        "single_font_size": 1.40,
        "double_font_size": 1.23,
        "font_outline_offset": 0.022,  # Thicken the printed strokes without adding depth
        "colors": {
            1: "#f5c01a", 2: "#1a4b9c", 3: "#d92525", 4: "#f45fa4",
            5: "#f27415", 6: "#137b3e", 7: "#691d24", 8: "#111111",
            9: "#f5c01a", 10: "#1a4b9c", 11: "#d92525", 12: "#f45fa4",
            13: "#f27415", 14: "#137b3e", 15: "#691d24"
        }
    },
    "xingjue": {
        "font": FONT_DIN,
        "style": "xingjue",  # No disc (transparent bg), black ring & black tall font (white on 8), underline on 6 & 9
        "stripe_axis": "Z",
        "stripe_half_width": 0.63,  # Ring projects to radius ~0.55; leave color beyond its edge
        "single_font_size": 1.68,
        "double_font_size": 1.48,
        "colors": {
            1: "#f5c01a", 2: "#1ea5e0", 3: "#d92525", 4: "#8c4bd6",
            5: "#f27415", 6: "#98a2ab", 7: "#994a20", 8: "#111111",
            9: "#f5c01a", 10: "#1ea5e0", 11: "#d92525", 12: "#8c4bd6",
            13: "#f27415", 14: "#98a2ab", 15: "#994a20"
        }
    }
}

def hex_to_linear(hex_str):
    h = hex_str.lstrip('#')
    srgb = [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]

def setup_ball_studio():
    if "BallStudio" in bpy.data.scenes:
        scene = bpy.data.scenes["BallStudio"]
    else:
        scene = bpy.data.scenes.new("BallStudio")
    bpy.context.window.scene = scene
    scene.view_settings.view_transform = 'Standard'

    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    # 1. Vibrant Studio World Ambient - bright and clean so colors pop and whites stay pure
    world = scene.world or bpy.data.worlds.new("BallStudioWorld")
    scene.world = world
    world.use_nodes = True
    bg_node = world.node_tree.nodes.get("Background")
    if bg_node:
        bg_node.inputs['Color'].default_value = (0.82, 0.82, 0.85, 1.0)
        bg_node.inputs['Strength'].default_value = 1.25

    # 2. Camera: Orthographic camera with ortho_scale 2.32 ensures the entire round ball is 100% visible with ~7% breathing margin (never clipped!)
    cam_data = bpy.data.cameras.new("RenderCam")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.32
    cam_obj = bpy.data.objects.new("RenderCam", cam_data)
    cam_obj.location = (0, -5.0, 0)
    cam_obj.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj

    # 3. Key Light: High-top-left soft point light for an elegant, subtle spherical sheen on the top crest
    key_data = bpy.data.lights.new("KeyLight", 'POINT')
    key_data.energy = 180.0
    key_data.shadow_soft_size = 0.35
    key_data.specular_factor = 0.5
    key_data.color = (1.0, 0.99, 0.97)
    key_obj = bpy.data.objects.new("KeyLight", key_data)
    key_obj.location = (-1.6, -2.5, 3.2)
    scene.collection.objects.link(key_obj)

    # 4. Fill Light: Soft right-side fill (specular_factor = 0 ensures no glare spots)
    fill_data = bpy.data.lights.new("FillLight", 'AREA')
    fill_data.energy = 85.0
    fill_data.size = 3.0
    fill_data.specular_factor = 0.0
    fill_data.color = (0.95, 0.97, 1.0)
    fill_obj = bpy.data.objects.new("FillLight", fill_data)
    fill_obj.location = (2.5, -3.0, 0.8)
    fill_obj.rotation_euler = (math.radians(110), math.radians(-30), math.radians(40))
    scene.collection.objects.link(fill_obj)

    # 5. Rim Light: Soft top-back rim for gentle spherical edge separation (specular_factor = 0)
    rim_data = bpy.data.lights.new("RimLight", 'AREA')
    rim_data.energy = 70.0
    rim_data.size = 2.5
    rim_data.specular_factor = 0.0
    rim_obj = bpy.data.objects.new("RimLight", rim_data)
    rim_obj.location = (0, 3.0, 3.0)
    rim_obj.rotation_euler = (math.radians(-45), 0, 0)
    scene.collection.objects.link(rim_obj)

    # 6. Bottom Bounce Light: Uplight to prevent murky black shadows on bottom curve (specular_factor = 0)
    bounce_data = bpy.data.lights.new("BottomBounce", 'POINT')
    bounce_data.energy = 45.0
    bounce_data.specular_factor = 0.0
    bounce_data.color = (1.0, 1.0, 1.0)
    bounce_obj = bpy.data.objects.new("BottomBounce", bounce_data)
    bounce_obj.location = (0, -2.5, -2.8)
    scene.collection.objects.link(bounce_obj)

    # 7. High-poly UV Sphere (Radius 1.0 with Subdivision for perfectly round silhouette)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, segments=128, ring_count=128, location=(0, 0, 0))
    sphere = bpy.context.active_object
    sphere.name = "BilliardBall"
    for poly in sphere.data.polygons:
        poly.use_smooth = True
    subsurf = sphere.modifiers.new("Subsurf", 'SUBSURF')
    subsurf.levels = 1
    subsurf.render_levels = 1

    return scene, sphere

def setup_medallion_scene():
    if "MedallionStudio" in bpy.data.scenes:
        m_scene = bpy.data.scenes["MedallionStudio"]
    else:
        m_scene = bpy.data.scenes.new("MedallionStudio")
    bpy.context.window.scene = m_scene
    m_scene.view_settings.view_transform = 'Standard'

    for obj in list(m_scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    cam_data = bpy.data.cameras.new("MedallionOrthoCam")
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 2.05
    cam_obj = bpy.data.objects.new("MedallionOrthoCam", cam_data)
    cam_obj.location = (0, 0, 5)
    cam_obj.rotation_euler = (0, 0, 0)
    m_scene.collection.objects.link(cam_obj)
    m_scene.camera = cam_obj

    # Pure unlit flat emission materials for maximum contrast and zero specular washing out
    def make_flat_mat(name, rgba):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        emit = nodes.new('ShaderNodeEmission')
        emit.inputs['Color'].default_value = rgba
        emit.inputs['Strength'].default_value = 1.0
        links.new(emit.outputs['Emission'], out.inputs['Surface'])
        return mat

    mat_ivory = make_flat_mat("M_Flat_Ivory", (0.97, 0.96, 0.94, 1.0))
    mat_black = make_flat_mat("M_Flat_Black", (0.0, 0.0, 0.0, 1.0))
    mat_white = make_flat_mat("M_Flat_White", (1.0, 1.0, 1.0, 1.0))

    # 1. Disc for Xingpai (radius 0.98, 128 vertices for perfectly round contour)
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=0.98, fill_type='NGON', location=(0, 0, 0))
    disc = bpy.context.active_object
    disc.name = "M_Disc"

    # 2. Ring for Xingjue (outer radius ~0.965, inner radius ~0.875)
    bpy.ops.curve.primitive_bezier_circle_add(radius=0.92, location=(0, 0, 0.005))
    ring = bpy.context.active_object
    ring.name = "M_Ring"
    ring.data.bevel_depth = 0.045
    ring.data.bevel_resolution = 6
    ring.data.fill_mode = 'FULL'

    # 3. Number Text
    bpy.ops.object.text_add(location=(0, 0.0, 0.01))
    txt = bpy.context.active_object
    txt.name = "M_Text"
    txt.data.align_x = 'CENTER'
    txt.data.align_y = 'CENTER'

    # 4. Underline for 6 and 9
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, -0.52, 0.01))
    line = bpy.context.active_object
    line.name = "M_Underline"
    line.scale = (0.44, 0.075, 1.0)

    m_scene.render.engine = 'BLENDER_EEVEE'
    m_scene.render.resolution_x = 512
    m_scene.render.resolution_y = 512
    m_scene.render.film_transparent = True
    m_scene.render.image_settings.file_format = 'PNG'

    return m_scene, disc, ring, txt, line, mat_ivory, mat_black, mat_white

def render_medallion(m_scene, disc, ring, txt, line, mat_ivory, mat_black, mat_white, theme_key, ball_num, out_path):
    bpy.context.window.scene = m_scene
    theme_cfg = THEMES[theme_key]
    font_path = theme_cfg["font"]
    font = bpy.data.fonts.load(font_path)
    txt.data.font = font
    txt.data.body = str(ball_num)

    is_double_digit = (ball_num >= 10)
    font_size = theme_cfg["double_font_size"] if is_double_digit else theme_cfg["single_font_size"]
    txt.data.size = font_size
    txt.data.offset = theme_cfg.get("font_outline_offset", 0.0)

    if theme_key == "xingjue":
        # Xingjue: transparent background (disc hidden), ring + font directly on ball body/stripe
        disc.hide_render = True
        ring.hide_render = False

        if ball_num == 8:
            # Black eight has white ring and white text
            ring.data.materials.clear()
            ring.data.materials.append(mat_white)
            txt.data.materials.clear()
            txt.data.materials.append(mat_white)
            line.hide_render = True
            txt.location = (0, 0.02, 0.01)
        else:
            ring.data.materials.clear()
            ring.data.materials.append(mat_black)
            txt.data.materials.clear()
            txt.data.materials.append(mat_black)

            if ball_num in (6, 9):
                line.hide_render = False
                line.data.materials.clear()
                line.data.materials.append(mat_black)
                line.location = (0, -0.52, 0.01)
                txt.location = (0, 0.06, 0.01)
            else:
                line.hide_render = True
                txt.location = (0, 0.02, 0.01)
    else:
        # Xingpai: striped balls use their white caps, without an extra ivory disc.
        disc.hide_render = ball_num >= 9
        disc.data.materials.clear()
        disc.data.materials.append(mat_ivory)

        ring.hide_render = True
        line.hide_render = True

        txt.data.materials.clear()
        txt.data.materials.append(mat_black)
        txt.location = (0, 0.0, 0.01)

    m_scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    return out_path

def build_ball_shader(sphere, theme_key, ball_num, medallion_img_path):
    theme_cfg = THEMES[theme_key]
    hex_col = theme_cfg["colors"][ball_num]
    ball_col = hex_to_linear(hex_col)
    ivory_col = hex_to_linear("#fcfbfa")
    is_striped = (ball_num >= 9)

    mat = bpy.data.materials.new(f"Mat_{theme_key}_{ball_num}")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 0.16
    bsdf.inputs['IOR'].default_value = 1.52
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.35
        bsdf.inputs["Coat Roughness"].default_value = 0.08
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = 0.35
        bsdf.inputs["Clearcoat Roughness"].default_value = 0.08

    tex_coord = nodes.new('ShaderNodeTexCoord')
    sep_xyz = nodes.new('ShaderNodeSeparateXYZ')
    links.new(tex_coord.outputs['Object'], sep_xyz.inputs['Vector'])

    medallion_img = bpy.data.images.load(medallion_img_path, check_existing=False)
    tex_node = nodes.new('ShaderNodeTexImage')
    tex_node.image = medallion_img
    tex_node.extension = 'CLIP'

    # Mapping node: scale 0.86 maps medallion to ~55% of the ball diameter!
    mapping = nodes.new('ShaderNodeMapping')
    mapping.vector_type = 'POINT'
    mapping.inputs['Scale'].default_value = (0.86, 0.86, 0.86)
    mapping.inputs['Location'].default_value = (0.5, 0.5, 0.0)

    comb_xyz = nodes.new('ShaderNodeCombineXYZ')
    links.new(sep_xyz.outputs['X'], comb_xyz.inputs['X'])
    links.new(sep_xyz.outputs['Z'], comb_xyz.inputs['Y'])
    links.new(comb_xyz.outputs['Vector'], mapping.inputs['Vector'])
    links.new(mapping.outputs['Vector'], tex_node.inputs['Vector'])

    if is_striped:
        abs_stripe_axis = nodes.new('ShaderNodeMath')
        abs_stripe_axis.operation = 'ABSOLUTE'
        links.new(sep_xyz.outputs[theme_cfg['stripe_axis']], abs_stripe_axis.inputs[0])

        stripe_mask = nodes.new('ShaderNodeMath')
        stripe_mask.operation = 'LESS_THAN'
        stripe_mask.inputs[1].default_value = theme_cfg['stripe_half_width']
        links.new(abs_stripe_axis.outputs['Value'], stripe_mask.inputs[0])

        mix_body = nodes.new('ShaderNodeMix')
        mix_body.data_type = 'RGBA'
        mix_body.inputs['A'].default_value = (ivory_col[0], ivory_col[1], ivory_col[2], 1.0)
        mix_body.inputs['B'].default_value = (ball_col[0], ball_col[1], ball_col[2], 1.0)
        links.new(stripe_mask.outputs['Value'], mix_body.inputs['Factor'])
        body_color_output = mix_body.outputs['Result']
    else:
        body_col_node = nodes.new('ShaderNodeRGB')
        body_col_node.outputs['Color'].default_value = (ball_col[0], ball_col[1], ball_col[2], 1.0)
        body_color_output = body_col_node.outputs['Color']

    abs_y = nodes.new('ShaderNodeMath')
    abs_y.operation = 'ABSOLUTE'
    links.new(sep_xyz.outputs['Y'], abs_y.inputs[0])

    y_mask = nodes.new('ShaderNodeMath')
    y_mask.operation = 'GREATER_THAN'
    y_mask.inputs[1].default_value = 0.28
    links.new(abs_y.outputs['Value'], y_mask.inputs[0])

    medallion_alpha = nodes.new('ShaderNodeMath')
    medallion_alpha.operation = 'MULTIPLY'
    links.new(tex_node.outputs['Alpha'], medallion_alpha.inputs[0])
    links.new(y_mask.outputs['Value'], medallion_alpha.inputs[1])

    mix_final = nodes.new('ShaderNodeMix')
    mix_final.data_type = 'RGBA'
    links.new(body_color_output, mix_final.inputs['A'])
    links.new(tex_node.outputs['Color'], mix_final.inputs['B'])
    links.new(medallion_alpha.outputs['Value'], mix_final.inputs['Factor'])

    links.new(mix_final.outputs['Result'], bsdf.inputs['Base Color'])
    # Subtle emission fill ensures rich, luminous, vibrant ball colors with no muddy dark shadows
    if "Emission Color" in bsdf.inputs:
        links.new(mix_final.outputs['Result'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 0.28
    elif "Emission" in bsdf.inputs:
        links.new(mix_final.outputs['Result'], bsdf.inputs['Emission'])

    links.new(bsdf.outputs['BSDF'], out_node.inputs['Surface'])

    emit_node = nodes.new('ShaderNodeEmission')
    links.new(mix_final.outputs['Result'], emit_node.inputs['Color'])

    sphere.data.materials.clear()
    sphere.data.materials.append(mat)
    return mat, bsdf, emit_node, out_node

def generate_all():
    print("🚀 Starting PoolPoker Ball Generation Pipeline...")
    b_scene, sphere = setup_ball_studio()
    m_scene, disc, ring, txt, line, mat_ivory, mat_black, mat_white = setup_medallion_scene()

    tmp_medallion_dir = os.path.join(OUTPUT_DIR, "_tmp_medallions")
    os.makedirs(tmp_medallion_dir, exist_ok=True)

    for theme_key in ["xingpai", "xingjue"]:
        out_2d_dir = os.path.join(OUTPUT_DIR, theme_key, "2d")
        out_3d_dir = os.path.join(OUTPUT_DIR, theme_key, "3d")
        os.makedirs(out_2d_dir, exist_ok=True)
        os.makedirs(out_3d_dir, exist_ok=True)

        print(f"\n🎨 Processing theme: {theme_key}...")
        for ball_num in range(1, 16):
            print(f"  -> Ball {ball_num}...")
            # 1. Render Medallion PNG
            m_path = os.path.join(tmp_medallion_dir, f"m_{theme_key}_{ball_num}.png")
            render_medallion(m_scene, disc, ring, txt, line, mat_ivory, mat_black, mat_white, theme_key, ball_num, m_path)

            # 2. Build Material on Sphere
            mat, bsdf, emit_node, out_node = build_ball_shader(sphere, theme_key, ball_num, m_path)

            # 3. Render 2D Beauty Sprite (256x256 WebP)
            bpy.context.window.scene = b_scene
            mat.node_tree.links.new(bsdf.outputs['BSDF'], out_node.inputs['Surface'])
            b_scene.render.engine = 'BLENDER_EEVEE'
            b_scene.render.resolution_x = 256
            b_scene.render.resolution_y = 256
            b_scene.render.film_transparent = True
            b_scene.render.image_settings.file_format = 'WEBP'
            b_scene.render.image_settings.quality = 95

            out_2d_file = os.path.join(out_2d_dir, f"{ball_num}.webp")
            b_scene.render.filepath = out_2d_file
            bpy.ops.render.render(write_still=True)

            # 4. Bake 3D Equirectangular UV Albedo Texture (1024x512 WebP)
            mat.node_tree.links.new(emit_node.outputs['Emission'], out_node.inputs['Surface'])
            bake_img = bpy.data.images.new(f"Bake_{theme_key}_{ball_num}", width=1024, height=512)
            img_node = mat.node_tree.nodes.new('ShaderNodeTexImage')
            img_node.image = bake_img

            for n in mat.node_tree.nodes:
                n.select = False
            img_node.select = True
            mat.node_tree.nodes.active = img_node

            for obj in b_scene.objects:
                obj.select_set(False)
            bpy.context.view_layer.objects.active = sphere
            sphere.select_set(True)

            b_scene.render.engine = 'CYCLES'
            b_scene.cycles.bake_type = 'EMIT'
            b_scene.cycles.samples = 1

            bpy.ops.object.bake(type='EMIT')

            out_3d_file = os.path.join(out_3d_dir, f"{ball_num}.webp")
            bake_img.filepath_raw = out_3d_file
            bake_img.file_format = 'WEBP'
            bake_img.save()

            # Clean up temporary image node and image
            mat.node_tree.nodes.remove(img_node)
            bpy.data.images.remove(bake_img)

    # Save master studio blend file to assets/models/billiards_balls.blend
    blend_target = os.path.join(PROJECT_ROOT, "assets", "models", "billiards_balls.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_target, copy=True)
    print(f"\n💾 Saved master Blender asset to: {blend_target}")
    print("✅ All ball assets successfully generated!")

if __name__ == "__main__":
    generate_all()
