import type { classroom_v1 } from 'googleapis';

export function createStudentProfileResolver(
  classroom: classroom_v1.Classroom,
  students: classroom_v1.Schema$Student[],
): (userId: string) => Promise<classroom_v1.Schema$UserProfile> {
  const profiles = new Map<string, Promise<classroom_v1.Schema$UserProfile>>();
  for (const student of students) {
    if (!student.profile) continue;
    for (const id of [student.userId, student.profile.id]) {
      if (id) profiles.set(id, Promise.resolve(student.profile));
    }
  }
  return userId => {
    let profile = profiles.get(userId);
    if (!profile) {
      profile = classroom.userProfiles.get({ userId }).then(response => response.data);
      profiles.set(userId, profile);
    }
    return profile;
  };
}
