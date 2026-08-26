using System;
using System.Reflection;
using UnityEngine;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Reads the local player's surfer so it can be sent to everyone else.
///
/// This is the state that makes a session multiplayer: where a rider is, which
/// way they are facing, and how fast they are going. Everything else — the
/// wave, the beach — is reproduced on each client rather than transmitted.
///
/// Read through reflection rather than typed calls. Manager.PlayerCharacter's
/// concrete type is not settled yet, and reflection lets this report what it
/// found instead of failing to compile against a guess.
/// </summary>
internal static class LocalSurfer
{
    private static Transform _transform;
    private static bool _looked;
    private static Vector3 _lastPosition;

    internal static bool Found => _transform != null;

    /// <summary>
    /// The object remote surfers are cloned from.
    ///
    /// Copying the local player is what lets a remote rider look like a rider
    /// without the mod shipping a model or a prefab of its own.
    /// </summary>
    internal static GameObject Template { get; private set; }

    /// <summary>Where the rider is, in world space.</summary>
    internal static Vector3 Position => _transform != null ? _transform.position : Vector3.zero;

    /// <summary>
    /// The rider's full orientation.
    ///
    /// Not a yaw angle. Euler decomposition is ambiguous — the same orientation
    /// can be described as (0, 210, 0) or (180, 30, 180), and Unity switches
    /// between them when a board leans past vertical. Rebuilding a rotation from
    /// the yaw alone therefore flipped remote surfers around on hard carves,
    /// which is exactly when somebody is worth watching.
    ///
    /// A quaternion has no such ambiguity, and carrying the lean as well means
    /// remote riders bank into turns instead of sliding about upright.
    /// </summary>
    internal static Quaternion Rotation => _transform != null ? _transform.rotation : Quaternion.identity;

    /// <summary>
    /// Derived rather than read off a rigidbody: velocity is wanted for
    /// interpolating a remote surfer between updates, and the difference
    /// between two positions is exactly that, without needing to find the body.
    /// </summary>
    internal static Vector3 Velocity { get; private set; }

    internal static void Tick(float dt)
    {
        if (!_looked) { _looked = true; Locate(); }
        if (_transform == null) return;

        var now = _transform.position;
        if (dt > 0f) Velocity = (now - _lastPosition) / dt;
        _lastPosition = now;
    }

    private static void Locate()
    {
        if (!GameHook.Ready) { _looked = false; return; } // try again once the game is up

        try
        {
            var manager = GameHook.Manager;
            var property = manager.GetType().GetProperty("PlayerCharacter",
                BindingFlags.Public | BindingFlags.Instance);

            if (property == null) { Mod.Log.Error("[surfer] Manager has no PlayerCharacter"); return; }

            var character = property.GetValue(manager);
            if (character == null) { _looked = false; return; } // not spawned yet

            Mod.Log.Msg($"[surfer] PlayerCharacter is {character.GetType().Name}");

            _transform = AsTransform(character);
            if (_transform == null)
            {
                Mod.Log.Error($"[surfer] no Transform reachable from {character.GetType().Name}");
                return;
            }

            Template = character as GameObject ?? _transform.gameObject;
            _lastPosition = _transform.position;
            Mod.Log.Msg($"[surfer] found at {_lastPosition}");
        }
        catch (Exception e)
        {
            Mod.Log.Error($"[surfer] locating: {e.GetType().Name}: {e.Message}");
        }
    }

    /// <summary>PlayerCharacter may be the component, its GameObject, or the Transform itself.</summary>
    private static Transform AsTransform(object o)
    {
        if (o is Transform t) return t;
        if (o is GameObject go) return go.transform;
        if (o is Component c) return c.transform;

        var property = o.GetType().GetProperty("transform", BindingFlags.Public | BindingFlags.Instance);
        return property?.GetValue(o) as Transform;
    }
}
