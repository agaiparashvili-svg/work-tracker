# Firebase წესები — საქვაბის შემოწმება (`inspections`)

ეს ფაილი აღწერს, რა წვდომის წესები (Security Rules) უნდა დაამატო Firebase-ში,
რომ „🔥 საქვაბის შემოწმების" ფორმამ იმუშაოს. ფუნქცია იყენებს:

- **Firestore კოლექციას** `inspections` — შემოწმების ჩანაწერების შესანახად
- **Storage ბილიკს** `inspections/{userId}/...` — ფოტოებისთვის

> ⚠️ **მნიშვნელოვანი:** ქვემოთ მოცემული ბლოკები **დასამატებელია** შენს
> არსებულ წესებში (works, users, ა.შ.). **ნუ წაშლი** არსებულ წესებს —
> უბრალოდ ჩასვი ეს ბლოკები შესაბამის ადგილას.

---

## 1) Firestore წესები

Firebase Console → **Firestore Database** → **Rules**.

შენს არსებულ `match /databases/{database}/documents { ... }` ბლოკის **შიგნით**
დაამატე ეს:

```
// ── საქვაბის შემოწმებები ──
match /inspections/{docId} {
  // წაკითხვა — ნებისმიერი ავტორიზებული მომხმარებელი
  // (აპი ერთიანად კითხულობს და კლიენტზე ფილტრავს — როგორც works-ის შემთხვევაში)
  allow read: if request.auth != null;

  // შექმნა — მხოლოდ ავტორიზებულმა, საკუთარი workerId-ით
  allow create: if request.auth != null
                && request.resource.data.workerId == request.auth.uid;

  // რედაქტირება/წაშლა — მხოლოდ ადმინი
  allow update, delete: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}
```

---

## 2) Storage წესები

Firebase Console → **Storage** → **Rules**.

შენს არსებულ `match /b/{bucket}/o { ... }` ბლოკის **შიგნით** დაამატე ეს:

```
// ── საქვაბის შემოწმების ფოტოები ──
match /inspections/{userId}/{fileName} {
  // წაკითხვა — ნებისმიერი ავტორიზებული
  allow read: if request.auth != null;

  // ატვირთვა — მხოლოდ მფლობელი, მაქს. 10MB, მხოლოდ სურათი
  allow write: if request.auth != null
               && request.auth.uid == userId
               && request.resource.size < 10 * 1024 * 1024
               && request.resource.contentType.matches('image/.*');
}
```

---

## 3) როგორ გამოვაქვეყნო

1. ზემოთ ბლოკები ჩასვი შესაბამის ადგილას (Firestore Rules / Storage Rules).
2. დააჭირე **Publish** თითოეულ რედაქტორში.
3. გამოქვეყნება მყისიერია — შემდეგ აპში „საქვაბის შემოწმების" გაგზავნა იმუშავებს.

---

## დანართი — სრული საცნობარო წესები (არასავალდებულო)

თუ გინდა მთლიანი წესების ნაკრები ნულიდან (ეს **ჩაანაცვლებს** არსებულს —
ფრთხილად!), აქ არის აპის ლოგიკიდან აღდგენილი ვერსია. გადაამოწმე, რომ შენს
რეალურ გამოყენებას ემთხვევა, სანამ გამოაქვეყნებ.

### Firestore — სრული

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function myRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    function isAdmin()   { return signedIn() && myRole() == 'admin'; }
    function isManager() { return signedIn() && (myRole() == 'admin' || myRole() == 'supervisor'); }

    // მომხმარებლები
    match /users/{uid} {
      allow read:   if signedIn();
      allow create: if signedIn() && request.auth.uid == uid
                    && request.resource.data.role == 'pending';
      allow update: if isAdmin()
                    || (request.auth.uid == uid
                        && request.resource.data.role == resource.data.role);
      allow delete: if isAdmin();
    }

    // სამუშაოები
    match /works/{id} {
      allow read:   if signedIn();
      allow create: if signedIn() && request.resource.data.workerId == request.auth.uid;
      allow update: if signedIn();   // სუპერვაიზერი/ადმინი ამოწმებს, კოეფიციენტი ა.შ.
      allow delete: if isAdmin();
    }

    // გადამისამართებები / დავალებები
    match /redirects/{id} {
      allow read:   if signedIn();
      allow create: if isManager();
      allow update: if signedIn();   // შემსრულებელი ანახლებს დავალების სტატუსს
      allow delete: if isManager();
    }

    // შეტყობინებები
    match /notifications/{id} {
      allow read, create, update: if signedIn();
      allow delete: if signedIn();
    }

    // მეილის რიგი (Cloud Function კითხულობს admin SDK-ით)
    match /emailQueue/{id} {
      allow create: if signedIn();
      allow read, update, delete: if isAdmin();
    }

    // პარამეტრები
    match /settings/{id} {
      allow read:  if signedIn();
      allow write: if isAdmin();
    }

    // საქვაბის შემოწმებები
    match /inspections/{id} {
      allow read:   if signedIn();
      allow create: if signedIn() && request.resource.data.workerId == request.auth.uid;
      allow update, delete: if isAdmin();
    }
  }
}
```

### Storage — სრული

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // სამუშაოების ფოტოები
    match /works/{userId}/{fileName} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 10 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }

    // საქვაბის შემოწმების ფოტოები
    match /inspections/{userId}/{fileName} {
      allow read:  if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 10 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```
