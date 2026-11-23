// r12：给高级权限模组用的「宿主那一份 three.js」（api.unsafe.three）。
// 模组自己打包的 three（比如 drgnext 的 vendor/three.module.min.js）和游戏不是同一份，造出来的网格、材质不能放进游戏的立体场景；
// 要把东西放进 api.unsafe.scene3d().scene，就用这里的类来造。只列常用的一批（整份导入会让游戏包多出几百 KB 用不到的代码），
// 以后要加只往后加，不删不改。
import {
  REVISION,
  Object3D, Group, Mesh, InstancedMesh, SkinnedMesh, Bone, Skeleton, Points, Line, LineSegments, Sprite,
  BufferGeometry, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute,
  PlaneGeometry, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, RingGeometry, CircleGeometry, TorusGeometry,
  MeshBasicMaterial, ShaderMaterial, RawShaderMaterial, PointsMaterial, LineBasicMaterial, SpriteMaterial,
  Texture, CanvasTexture, DataTexture,
  Color, Vector2, Vector3, Vector4, Quaternion, Euler, Matrix3, Matrix4, Box3, Sphere, MathUtils,
  FrontSide, BackSide, DoubleSide,
  NoBlending, NormalBlending, AdditiveBlending, SubtractiveBlending, MultiplyBlending, CustomBlending,
  AddEquation, SubtractEquation, ReverseSubtractEquation, MinEquation, MaxEquation,
  ZeroFactor, OneFactor, SrcColorFactor, OneMinusSrcColorFactor, SrcAlphaFactor, OneMinusSrcAlphaFactor, DstAlphaFactor, OneMinusDstAlphaFactor, DstColorFactor, OneMinusDstColorFactor,
  NeverDepth, AlwaysDepth, LessDepth, LessEqualDepth, EqualDepth, GreaterEqualDepth, GreaterDepth, NotEqualDepth,
  NoColorSpace, SRGBColorSpace, LinearSRGBColorSpace,
  NearestFilter, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping, RepeatWrapping, MirroredRepeatWrapping,
  RGBAFormat, UnsignedByteType, FloatType, HalfFloatType,
  StaticDrawUsage, DynamicDrawUsage, StreamDrawUsage,
  AttachedBindMode, DetachedBindMode,
} from 'three';

export const THREE_FOR_MODS: Readonly<Record<string, unknown>> = Object.freeze({
  REVISION,
  Object3D, Group, Mesh, InstancedMesh, SkinnedMesh, Bone, Skeleton, Points, Line, LineSegments, Sprite,
  BufferGeometry, BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute,
  PlaneGeometry, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, RingGeometry, CircleGeometry, TorusGeometry,
  MeshBasicMaterial, ShaderMaterial, RawShaderMaterial, PointsMaterial, LineBasicMaterial, SpriteMaterial,
  Texture, CanvasTexture, DataTexture,
  Color, Vector2, Vector3, Vector4, Quaternion, Euler, Matrix3, Matrix4, Box3, Sphere, MathUtils,
  FrontSide, BackSide, DoubleSide,
  NoBlending, NormalBlending, AdditiveBlending, SubtractiveBlending, MultiplyBlending, CustomBlending,
  AddEquation, SubtractEquation, ReverseSubtractEquation, MinEquation, MaxEquation,
  ZeroFactor, OneFactor, SrcColorFactor, OneMinusSrcColorFactor, SrcAlphaFactor, OneMinusSrcAlphaFactor, DstAlphaFactor, OneMinusDstAlphaFactor, DstColorFactor, OneMinusDstColorFactor,
  NeverDepth, AlwaysDepth, LessDepth, LessEqualDepth, EqualDepth, GreaterEqualDepth, GreaterDepth, NotEqualDepth,
  NoColorSpace, SRGBColorSpace, LinearSRGBColorSpace,
  NearestFilter, LinearFilter, LinearMipmapLinearFilter, ClampToEdgeWrapping, RepeatWrapping, MirroredRepeatWrapping,
  RGBAFormat, UnsignedByteType, FloatType, HalfFloatType,
  StaticDrawUsage, DynamicDrawUsage, StreamDrawUsage,
  AttachedBindMode, DetachedBindMode,
});
