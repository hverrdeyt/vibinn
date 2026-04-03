import { Place, User } from './types';

export const MOCK_PLACES: Place[] = [
  {
    id: 'p-bos-1',
    name: 'Beacon Hill Bookshop',
    location: 'Boston, USA',
    description: 'Cozy shelves, soft light, and a lowkey corner for disappearing offline.',
    image: 'https://images.unsplash.com/photo-1526243741027-444d633d7365?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1526243741027-444d633d7365?auto=format&fit=crop&w=800&q=80',
    ],
    tags: ['bookstore', 'cozy', 'hidden-gem'],
    similarityStat: 88,
    whyYoullLikeIt: [
      'great for solo afternoons',
      'quiet neighborhood energy',
    ],
    priceRange: '$',
    category: 'Bookstore / Cafe'
  },
  {
    id: 'p-bos-2',
    name: 'Harborwalk Lookout',
    location: 'Boston, USA',
    description: 'Waterside skyline pause with enough breeze to reset the day.',
    image: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=800&q=80',
    ],
    tags: ['waterfront', 'scenic', 'photo-stop'],
    similarityStat: 86,
    whyYoullLikeIt: [
      'easy city reset by the water',
      'best when the harbor light softens',
    ],
    priceRange: 'Free',
    category: 'Waterfront Walk'
  },
  {
    id: 'p-bos-3',
    name: 'South End Coffee Counter',
    location: 'Boston, USA',
    description: 'Compact neighborhood coffee stop with strong espresso and slower energy.',
    image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80',
    ],
    tags: ['coffee', 'local-pick', 'easy-pause'],
    similarityStat: 83,
    whyYoullLikeIt: [
      'fits a slower coffee-stop mood',
      'good first stop before wandering the neighborhood',
    ],
    priceRange: '$',
    category: 'Cafe'
  },
  {
    id: 'p1',
    name: 'TeamLab Borderless',
    location: 'Tokyo, Japan',
    description: 'A world of digital art without boundaries. Pure aesthetic.',
    image: 'https://images.unsplash.com/photo-1550985616-10810253b84d?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1550985616-10810253b84d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80'
    ],
    tags: ['aesthetic', 'interactive', 'vibe-match'],
    similarityStat: 82,
    whyYoullLikeIt: [
      'Perfect for your aesthetic feed',
      'Interactive art that responds to you',
      'Lowkey spot if you go early'
    ],
    priceRange: '$$',
    category: 'Art / Experience'
  },
  {
    id: 'p2',
    name: 'Gion District',
    location: 'Kyoto, Japan',
    description: 'Traditional vibes, hidden tea houses, and geisha sightings.',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80'
    ],
    tags: ['culture', 'nature', 'people-like-you'],
    similarityStat: 68,
    whyYoullLikeIt: [
      'Authentic Kyoto vibes',
      'Great for slow exploration',
      'Hidden gems around every corner'
    ],
    priceRange: 'Free',
    category: 'Culture / Sightseeing'
  },
  {
    id: 'p3',
    name: 'Onion Cafe',
    location: 'Seoul, South Korea',
    description: 'Industrial chic bakery in a renovated hanok. Best salt bread.',
    image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
    images: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?auto=format&fit=crop&w=800&q=80'
    ],
    tags: ['cafe', 'aesthetic', 'vibe-match'],
    similarityStat: 75,
    whyYoullLikeIt: [
      'Best salt bread in Seoul',
      'Unique industrial-hanok architecture',
      'Great lighting for photos'
    ],
    priceRange: '$',
    category: 'Cafe / Bakery'
  },
];

export const MOCK_USER: User = {
  id: 'u1',
  username: 'alex.vibe',
  displayName: 'Alex Rivera',
  bio: 'Chasing aesthetics and hidden cafes. ☕️✨ Currently in Tokyo.',
  avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=800&q=80',
  badges: ['Cafe Hunter', 'City Roamer', 'Lowkey Explorer'],
  flags: ['🇯🇵', '🇰🇷', '🇫🇷', '🇹🇭'],
  stats: {
    countries: 12,
    cities: 45,
    trips: 28,
  },
  travelHistory: [
    {
      country: 'Japan',
      cities: ['Tokyo', 'Kyoto', 'Osaka', 'Nara'],
      places: [MOCK_PLACES[0], MOCK_PLACES[1]]
    },
    {
      country: 'South Korea',
      cities: ['Seoul', 'Busan', 'Jeju'],
      places: [MOCK_PLACES[2]]
    },
  ],
};

export const SIMILAR_TRAVELERS: User[] = [
  {
    id: 'u2',
    username: 'maya.wanders',
    displayName: 'Maya Chen',
    bio: 'Solo traveler, film photography enthusiast. 🎞️✨',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
    badges: ['Film Geek', 'Solo Traveler', 'Museum Lover'],
    flags: ['🇯🇵', '🇮🇸', '🇳🇴', '🇨🇭', '🇮🇹'],
    stats: { countries: 15, cities: 38, trips: 22 },
    matchScore: 94,
    travelHistory: [
      {
        country: 'Japan',
        cities: ['Tokyo', 'Kyoto'],
        places: [MOCK_PLACES[0], MOCK_PLACES[1]]
      }
    ]
  },
  {
    id: 'u3',
    username: 'kai.explores',
    displayName: 'Kai Tan',
    bio: 'Street food and city lights. 🍜🌃',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
    badges: ['Street Foodie', 'Night Owl', 'Local Legend'],
    flags: ['🇹🇼', '🇭🇰', '🇸🇬', '🇲🇾'],
    stats: { countries: 8, cities: 25, trips: 15 },
    matchScore: 87,
    travelHistory: [
      {
        country: 'Taiwan',
        cities: ['Taipei'],
        places: []
      }
    ]
  },
  {
    id: 'u4',
    username: 'luna.vibes',
    displayName: 'Luna Moreau',
    bio: 'Luxury meets local culture. 🥂🏯',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
    badges: ['Luxury Nomad', 'Culture Seeker', 'Aesthetic Queen'],
    flags: ['🇦🇪', '🇲🇨', '🇫🇷', '🇬🇷'],
    stats: { countries: 22, cities: 60, trips: 40 },
    matchScore: 72,
    travelHistory: [
      {
        country: 'France',
        cities: ['Paris', 'Nice'],
        places: []
      }
    ]
  },
];
