// app/api/public-api/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { envConfig } from 'config/env.config';

async function getShortLink(origin_url: string) {
  const shopee_url = "https://affiliate.shopee.vn/api/v3/gql"
  const cookie = envConfig.shopee.cookies || ''
  const afAcEncDat = envConfig.shopee.afAcEncDat

  const response = await fetch(shopee_url, {
    method: 'POST',
    headers: {
      'af-ac-enc-dat': afAcEncDat,
      'content-type': 'application/json; charset=UTF-8',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'Cookie': cookie
    },
    body: JSON.stringify({
      query: `
          query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller){
          batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller){
              shortLink
              longLink
              failCode
          }
          }
      `,
      variables: {
          linkParams: [{
          originalLink: origin_url,
          advancedLinkParams: {}
          }],
          sourceCaller: "CUSTOM_LINK_CALLER"
      }
      })
  });

  return response;
}

// Export named function GET (không dùng export default)
export async function GET(request: NextRequest) {
  try {
    // Lấy URL từ search params
    const searchParams = request.nextUrl.searchParams;
    const origin_url = searchParams.get('url');

    // Validate URL
    if (!origin_url) {
      return NextResponse.json(
        { 
          error: 'Bad Request',
          message: 'URL parameter is required. Usage: https://shopee.vn/' 
        },
        { status: 400 }
      );
    }

    // Kiểm tra URL hợp lệ
    let targetUrl: URL;
    try {
      targetUrl = new URL(origin_url);
    } catch (error) {
      return NextResponse.json(
        { 
          error: 'Invalid URL',
          message: 'The provided URL is not valid' 
        },
        { status: 400 }
      );
    }

    // Chỉ cho phép HTTP và HTTPS
    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return NextResponse.json(
        { 
          error: 'Invalid Protocol',
          message: 'Only HTTP and HTTPS protocols are allowed' 
        },
        { status: 400 }
      );
    }

    console.log(`Fetching URL: ${origin_url}`);

    // Gọi API từ URL được cung cấp
    const response = await getShortLink(origin_url)

    // Kiểm tra response status
    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'API Error',
          message: `Target API returned status ${response.status}`,
          statusText: response.statusText
        },
        { status: response.status }
      );
    }

    // Lấy content type
    const contentType = response.headers.get('content-type');

    // Xử lý response dựa trên content type
    if (contentType && contentType.includes('application/json')) {
      const responseData = await response.json();
      const shortLink = responseData?.data?.batchCustomLink?.[0]?.shortLink;
      
      if (!shortLink) {
        return NextResponse.json(
          {
            error: 'No short link found or token expired',
            message: 'Could not generate short link from API'
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        shortLink
      });
    }
    //  else if (contentType && contentType.includes('text/')) {
    //   const text = await response.text();
    //   return NextResponse.json({
    //     success: true,
    //     data: text,
    //     contentType: contentType
    //   });
    // } else {
      // Trả về dữ liệu binary dưới dạng base64
    //   const buffer = await response.arrayBuffer();
    //   console.log(buffer, 'buffer')
    //   const base64 = Buffer.from(buffer).toString('base64');
    //   return NextResponse.json({
    //     success: true,
    //     data: base64,
    //     // contentType: contentType,
    //     encoding: 'base64'
    //   });
    // }

  } catch (error: any) {
    console.error('Error fetching URL:', error);

    // Xử lý timeout error
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Gateway Timeout',
          message: 'Request timeout after 10 seconds'
        },
        { status: 504 }
      );
    }

    // Xử lý network error
    if (error.cause && error.cause.code === 'ENOTFOUND') {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Could not reach the target URL. DNS lookup failed.'
        },
        { status: 404 }
      );
    }

    // Lỗi chung
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error.message || 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

// Nếu cần hỗ trợ POST
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, method = 'POST', headers = {}, data } = body;
    const origin_url = url

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required in request body' },
        { status: 400 }
      );
    }

    const response = await getShortLink(origin_url)

    // Kiểm tra response status
    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'API Error',
          message: `Target API returned status ${response.status}`,
          statusText: response.statusText
        },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type');

    // Xử lý response dựa trên content type
    if (contentType && contentType.includes('application/json')) {
      const responseData = await response.json();
      const shortLink = responseData?.data?.batchCustomLink?.[0]?.shortLink;
      
      if (!shortLink) {
        return NextResponse.json(
          {
            error: 'No short link found or token expired',
            message: 'Could not generate short link from API'
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        shortLink
      });
    }

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Optional: Config cho route
export const runtime = 'nodejs'; // hoặc 'edge'
export const dynamic = 'force-dynamic'; // Không cache