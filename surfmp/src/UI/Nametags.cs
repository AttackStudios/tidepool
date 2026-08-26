using System;
using System.Collections.Generic;
using UnityEngine;

namespace TidePool.SurfMP.UI;

/// <summary>
/// Who is who, in the water.
///
/// Names are drawn over each remote surfer, so a lineup is people rather than
/// anonymous boards. Drawn in screen space from the world position the wire
/// already carries — no scene objects, no prefabs, nothing to keep in sync with
/// a rider that may vanish mid-frame.
///
/// Immediate-mode GUI calls only. The game never uses IMGUI, so Unity stripped
/// the auto-layout half out of the build and GUILayout throws.
/// </summary>
internal static class Nametags
{
    /// <summary>
    /// Just clear of the rider's head.
    ///
    /// 0.9 put names noticeably high — the world offset and the label's own
    /// height stack, so the gap was nearly twice what it looked like in code.
    /// </summary>
    private const float HeightOffset = 0.35f;

    /// <summary>Beyond this the lineup turns to noise, so names fade out.</summary>
    private const float FadeStart = 12f;
    private const float FadeEnd = 22f;

    private static Camera _camera;

    /// <summary>
    /// Roughly how wide a character is, for centring.
    ///
    /// GUI.Label aligns upper-left, so a name in a fixed-width box sits well
    /// left of the surfer. Centring properly would mean a GUIStyle with a
    /// TextAnchor, which drags in another Unity module and an Il2Cpp
    /// constructor that does not map cleanly — for one line of text, estimating
    /// the width is the smaller thing to get wrong.
    /// </summary>
    private const float CharWidth = 8f;

    internal static void Draw(IEnumerable<(string Name, Vector3 Position)> surfers)
    {
        var camera = Eye();
        if (camera == null) return;

        foreach (var (name, position) in surfers)
        {
            if (string.IsNullOrEmpty(name)) continue;

            var head = position + Vector3.up * HeightOffset;
            var screen = camera.WorldToScreenPoint(head);

            // Behind the camera projects to a point in front of it, which would
            // paint names for people you cannot see.
            if (screen.z <= 0f) continue;

            var distance = screen.z;
            if (distance > FadeEnd) continue;

            var alpha = distance <= FadeStart
                ? 1f
                : 1f - (distance - FadeStart) / (FadeEnd - FadeStart);

            var previous = GUI.color;
            GUI.color = new Color(1f, 1f, 1f, alpha);

            const float h = 20f;
            var w = name.Length * CharWidth + 8f;
            GUI.Label(new Rect(screen.x - w * 0.5f, Screen.height - screen.y - h, w, h), name);

            GUI.color = previous;
        }
    }

    /// <summary>
    /// The camera to project through.
    ///
    /// Cached because the lookup is not free, and re-checked when it goes away —
    /// loading a beach destroys and rebuilds the rig.
    /// </summary>
    private static Camera Eye()
    {
        if (_camera != null) return _camera;

        try
        {
            _camera = Camera.main;
            if (_camera == null && Camera.allCamerasCount > 0)
            {
                var all = new Camera[Camera.allCamerasCount];
                Camera.GetAllCameras(all);
                foreach (var c in all) if (c != null && c.enabled) { _camera = c; break; }
            }
        }
        catch (Exception) { return null; }

        return _camera;
    }
}
