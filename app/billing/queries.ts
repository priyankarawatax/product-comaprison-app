export const SHOP_QUERY = `#graphql
  query BillingShop {
    shop {
      id
      name
      myshopifyDomain
      primaryDomain { host }
      currencyCode
      ianaTimezone
      plan { partnerDevelopment }
    }
  }
`;

export const SUBSCRIPTION_QUERY = `
  query BillingSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      billingPeriod
      cancelAtEndOfCycle
      trialEndsAt
      currentBillingCycle { startTime endTime }
      items {
        handle
        price { __typename active currency ... on FlatRatePrice { amount } }
      }
      pendingUpdate { billingPeriod items { handle } }
      legacySubscriptionId
    }
  }
`;
