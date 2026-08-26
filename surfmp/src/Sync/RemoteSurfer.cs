using System;
using UnityEngine;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Another player, in your water.
///
/// Built by cloning the local PlayerCharacter, so a remote rider looks exactly
/// like a rider without needing a model, a prefab, or anything shipped with the
/// mod. The clone's own logic is then switched off: it must be a puppet driven
/// by the wire, not a second surfer trying to surf.
/// </summary>
internal sealed class RemoteSurfer
{
    /// <summary>
    /// Positions arrive about twenty times a second; frames render far more
    /// often. Moving straight to each new position would visibly step, so
    /// converge toward it instead — fast enough to stay honest, smooth enough
    /// to read as a person rather than a teleporting sprite.
    /// </summary>
    private const float Converge = 12f;

    private readonly GameObject _object;
    private readonly Transform _transform;

    private Vector3 _target;
    private Vector3 _velocity;
    private float _heading;

    internal string Name { get; }

    private RemoteSurfer(string name, GameObject clone)
    {
        Name = name;
        _object = clone;
        _transform = clone.transform;
        _target = _transform.position;
    }

    /// <summary>Returns null rather than throwing: a missing surfer is not worth a dead session.</summary>
    internal static RemoteSurfer Spawn(string name, GameObject template)
    {
        try
        {
            if (template == null) return null;

            var clone = UnityEngine.Object.Instantiate(template);
            clone.name = $"SurfMP:{name}";

            Silence(clone);

            Mod.Log.Msg($"[surfer] spawned {name}");
            return new RemoteSurfer(name, clone);
        }
        catch (Exception e)
        {
            Mod.Log.Error($"[surfer] spawning {name}: {e.GetType().Name}: {e.Message}");
            return null;
        }
    }

    /// <summary>
    /// Switch off everything that would make the clone act on its own.
    ///
    /// Its Surf behaviours would otherwise paddle, catch waves and respond to
    /// input — the local player's input, since that is the only input this
    /// process has. Physics goes kinematic for the same reason: the wire owns
    /// this transform, and a rigidbody would fight every update.
    /// </summary>
    private static void Silence(GameObject clone)
    {
        // Il2CppInterop returns nothing from the generic
        // GetComponentsInChildren<T>() — proven when a hunt for the rider's
        // components found zero on an object that plainly had twenty-six. The
        // non-generic overload with an Il2Cpp type works. This mattered: with
        // the generic call, nothing here ran, so a remote clone kept its Surf
        // behaviours and tried to surf on the local player's input, which is
        // the one thing this method exists to prevent.
        Il2CppInterop.Runtime.InteropTypes.Arrays.Il2CppReferenceArray<Component> all;
        try
        {
            all = clone.GetComponentsInChildren(
                Il2CppInterop.Runtime.Il2CppType.Of<Component>(), true);
        }
        catch (Exception e)
        {
            Mod.Log.Error($"[surfer] cannot read clone components: {e.Message}");
            return;
        }

        if (all == null || all.Length == 0) { Mod.Log.Error("[surfer] clone has no components"); return; }

        var silenced = 0;

        foreach (var component in all)
        {
            if (component == null) continue;

            // GetType() on an interop wrapper reports the wrapper, so every
            // component looks like "Component". Ask IL2CPP for the real name.
            var name = ClassName(component.Pointer);

            try
            {
                switch (name)
                {
                    // Physics would fight the transform the wire owns.
                    case "Rigidbody":
                        component.TryCast<Rigidbody>()!.isKinematic = true;
                        silenced++;
                        continue;

                    // There can only be one of each that matters, and it is the
                    // local player's.
                    case "Camera":
                        component.TryCast<Camera>()!.enabled = false;
                        silenced++;
                        continue;
                    case "AudioListener":
                        component.TryCast<AudioListener>()!.enabled = false;
                        silenced++;
                        continue;
                }

                // Everything the game itself drives: movement, input, buoyancy,
                // wave-catching. A remote rider is a puppet, not a surfer.
                if (!IsGameLogic(name)) continue;
                var behaviour = component.TryCast<Behaviour>();
                if (behaviour == null) continue;
                behaviour.enabled = false;
                silenced++;
            }
            catch (Exception) { /* a component that refuses is not fatal */ }
        }

        Mod.Log.Msg($"[surfer] silenced {silenced} of {all.Length} component(s) on the clone");
    }

    /// <summary>
    /// Named explicitly rather than by namespace.
    ///
    /// The namespace is unavailable — GetType() describes the interop wrapper —
    /// so the list comes from the rider's actual component inventory, logged
    /// from a running game.
    /// </summary>
    private static bool IsGameLogic(string name) => name switch
    {
        "Controls" or "Buoyancy" or "FluidSlicer" or "SurfMode" or "AutoSurf"
            or "ExpertSurf" or "TutorialSurf" or "Movement" or "MovementState"
            or "MovementTime" or "MovementFx" or "WakeFxSpawner" or "Sounds"
            or "Parallax" or "Profile" => true,
        _ => false,
    };

    private static string ClassName(IntPtr obj)
    {
        try
        {
            var klass = Il2CppInterop.Runtime.IL2CPP.il2cpp_object_get_class(obj);
            var namePtr = Il2CppInterop.Runtime.IL2CPP.il2cpp_class_get_name(klass);
            return System.Runtime.InteropServices.Marshal.PtrToStringAnsi(namePtr) ?? "";
        }
        catch (Exception) { return ""; }
    }

    internal void Apply(Vector3 position, float heading, Vector3 velocity)
    {
        _target = position;
        _heading = heading;
        _velocity = velocity;
    }

    internal void Tick(float dt)
    {
        if (_transform == null) return;

        // Carry the last known velocity forward between updates. Without it a
        // rider stalls at their last reported point and then jumps, which reads
        // far worse than being slightly wrong about where they are.
        _target += _velocity * dt;

        var t = 1f - Mathf.Exp(-Converge * dt);
        _transform.position = Vector3.Lerp(_transform.position, _target, t);

        var facing = Quaternion.Euler(0f, _heading, 0f);
        _transform.rotation = Quaternion.Slerp(_transform.rotation, facing, t);
    }

    internal void Despawn()
    {
        try { if (_object != null) UnityEngine.Object.Destroy(_object); }
        catch (Exception) { }
    }
}
