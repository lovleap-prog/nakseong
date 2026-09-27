// Firestore 백엔드 — 실시간 동기화 + 구글 로그인.
// 설정에서 backend:'firestore' 이고 firebase 키가 채워졌을 때만 동적으로 불러온다.
import { COLLECTIONS, emit, setUser } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

export async function createFirestoreBackend(cfg) {
  const [appMod, dbMod, authMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-auth.js`),
  ]);

  const app = appMod.initializeApp(cfg.firebase);
  const db = dbMod.getFirestore(app);
  const auth = authMod.getAuth(app);
  const schoolId = cfg.schoolId || 'default';
  const base = (c) => dbMod.collection(db, 'schools', schoolId, c);

  // 오프라인에서도 열리도록 로컬 캐시를 켠다(여러 탭 동시 사용 허용).
  try { await dbMod.enableMultiTabIndexedDbPersistence(db); } catch { /* 이미 켜졌거나 미지원 */ }

  const cache = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  let firstLoad;
  let stopMineList = [];   // 본인 것만 보는 컬렉션의 구독 해제 함수들
  let stopMe = null;       // 내 명단 문서 구독 해제 함수
  let stopShared = [];     // 공용 자료 구독 해제 함수들
  let watching = false;    // 공용 자료를 지금 보고 있는가
  // 컬렉션마다 마지막 읽기 실패. 규칙에 막히면 화면이 '자료 없음' 과 똑같아 보여서,
  // 콘솔을 열지 않으면 무엇이 잘못됐는지 알 수가 없었다.
  const readErr = {};

  /**
   * 본인 것만 보는 컬렉션. 문서 번호가 그 사람의 uid 다.
   *
   * 파이어스토어는 **권한 없는 문서가 섞일 수 있는 질의를 통째로 거부한다.**
   * 그래서 읽기 규칙을 본인으로 좁힌 컬렉션은 구독도 문서 단위여야 한다.
   * 여기 빠뜨리면 '공용 자료' 로 묶여 컬렉션째 구독되고, 규칙에 걸려
   * Missing or insufficient permissions 만 찍히며 그 기능이 통째로 죽는다.
   * (개인 메모가 실제로 그랬다)
   */
  const MINE_ONLY = ['checks', 'memos'];

  /** 내 문서 하나만 구독한다. 로그아웃하면 uid 를 비워 부른다. */
  function watchMine(uid) {
    for (const stop of stopMineList) stop();
    stopMineList = [];
    for (const c of MINE_ONLY) { cache[c] = []; emit(c); }
    if (!uid) return;
    for (const c of MINE_ONLY) {
      const stop = dbMod.onSnapshot(
        dbMod.doc(db, 'schools', schoolId, c, uid),
        (snap) => {
          cache[c] = snap.exists() ? [{ id: snap.id, ...snap.data() }] : [];
          emit(c);
        },
        (err) => console.error('[firestore]', c, err),
      );
      stopMineList.push(stop);
    }
  }

  async function signIn() {
    const provider = new authMod.GoogleAuthProvider();
    if (cfg.googleHostedDomain) provider.setCustomParameters({ hd: cfg.googleHostedDomain });
    await authMod.signInWithPopup(auth, provider);
  }

  /**
   * 로그인한 사람의 명단 문서를 만들고, 그 문서를 계속 지켜본다.
   *
   * 학교 구글 도메인으로 막을 수 없는 경우(선생님들이 개인 메일을 쓰는 경우)가 많다.
   * 그래서 '로그인했으면 통과' 로 두면 주소를 아는 사람이 아무 구글 계정으로 들어와
   * 출장 사유와 업무분장까지 다 보게 된다. 그래서 승인을 한 단계 둔다.
   *
   * 지켜보는 이유는, 관리자가 승인하는 순간 대기 화면이 새로 고침 없이 열리게 하기 위해서다.
   */
  async function resolveMember(u) {
    const ref = dbMod.doc(db, 'schools', schoolId, 'members', u.uid);
    const snap = await dbMod.getDoc(ref);
    if (!snap.exists()) {
      // 최초 로그인. approved:false 로 넣는다. 규칙이 스스로 승인하는 것을 막는다.
      await dbMod.setDoc(ref, {
        email: u.email || '', name: u.displayName || u.email || '',
        role: 'teacher', dept: '', approved: false,
        joinedAt: new Date().toISOString(),
      });
    }

    if (stopMe) { stopMe(); stopMe = null; }
    return new Promise((done) => {
      let first = true;
      stopMe = dbMod.onSnapshot(ref, (s2) => {
        const d = s2.exists() ? s2.data() : null;
        const approved = !!(d && d.approved);
        setUser({
          uid: u.uid,
          email: u.email || '',
          name: (d && d.name) || u.displayName || u.email || '',
          role: (d && d.role) || 'teacher',
          dept: (d && d.dept) || '',
          canNotice: !!(d && d.canNotice),
          approved,
        });
        // 승인되면 그때 공용 자료를 구독한다. 승인 전에 구독하면 규칙에 막혀
        // 오류만 쌓이고, 화면에 보일 것도 없다.
        if (approved) startShared(); else stopSharedWatch();
        emit('auth');
        if (first) { first = false; done(); }
      }, (err) => {
        console.error('[firestore] members', err);
        if (first) { first = false; done(); }
      });
    });
  }

  authMod.onAuthStateChanged(auth, async (u) => {
    if (u) {
      await resolveMember(u);
      watchMine(u.uid);
    } else {
      if (stopMe) { stopMe(); stopMe = null; }
      stopSharedWatch();
      setUser({ uid: '', role: 'teacher', name: '', dept: '', email: '', approved: false, canNotice: false });
      watchMine(null);
      emit('auth');
    }
  });

  /**
   * 공용 자료 구독을 켠다. 승인된 뒤에만 부른다.
   * checks 와 memos 는 본인 문서만 봐야 하므로 여기서 빼고 따로 구독한다.
   */
  function startShared() {
    if (watching) return;
    watching = true;
    const shared = COLLECTIONS.filter((c) => !MINE_ONLY.includes(c));
    for (const c of shared) {
      const stop = dbMod.onSnapshot(base(c), (snap) => {
        cache[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        delete readErr[c];
        emit(c);
      }, (err) => {
        console.error('[firestore]', c, err);
        readErr[c] = err.code || err.message || '읽기 실패';
        emit(c); emit('readerr');
      });
      stopShared.push(stop);
    }
  }

  function stopSharedWatch() {
    if (!watching) return;
    watching = false;
    for (const stop of stopShared) stop();
    stopShared = [];
    for (const c of COLLECTIONS) if (!MINE_ONLY.includes(c)) cache[c] = [];
    for (const c of COLLECTIONS) emit(c);
  }

  /** 로그인 상태가 정해질 때까지 기다린다. 첫 화면을 잘못 그리지 않으려는 것이다. */
  function firstAuth() {
    return new Promise((res) => {
      const stop = authMod.onAuthStateChanged(auth, () => { stop(); res(); });
    });
  }

  return {
    kind: 'firestore',
    signIn,
    // '자료가 어디에 있나' 를 한 화면에서 답하기 위한 것들
    where: () => ({ schoolId, uid: auth.currentUser ? auth.currentUser.uid : '', email: auth.currentUser ? auth.currentUser.email : '', watching }),
    readErrors: () => ({ ...readErr }),
    signOut: () => authMod.signOut(auth),
    // 로그인 여부가 정해질 때까지만 기다린다. 자료는 승인된 뒤에 들어온다.
    async ready() { firstLoad = firstAuth(); await firstLoad; },
    signedIn: () => !!auth.currentUser,
    /** 명단 승인/역할 바꾸기 — 관리자만. 규칙이 한 번 더 막는다. */
    async setMember(uid2, patch) {
      await dbMod.setDoc(dbMod.doc(db, 'schools', schoolId, 'members', uid2), patch, { merge: true });
    },
    list(c) { return cache[c] || []; },
    async put(c, doc) {
      const { id, ...rest } = doc;
      await dbMod.setDoc(dbMod.doc(db, 'schools', schoolId, c, id), rest, { merge: false });
    },
    async putMany(c, docs) {
      // 배치 한도(500)에 맞춰 잘라서 쓴다.
      for (let i = 0; i < docs.length; i += 400) {
        const batch = dbMod.writeBatch(db);
        for (const d of docs.slice(i, i + 400)) {
          const { id, ...rest } = d;
          batch.set(dbMod.doc(db, 'schools', schoolId, c, id), rest);
        }
        await batch.commit();
      }
    },
    async remove(c, id) { await dbMod.deleteDoc(dbMod.doc(db, 'schools', schoolId, c, id)); },
    async replace(c, docs) {
      const existing = cache[c].map((d) => d.id);
      const keep = new Set(docs.map((d) => d.id));
      for (const id of existing) if (!keep.has(id)) await this.remove(c, id);
      await this.putMany(c, docs);
    },
  };
}
