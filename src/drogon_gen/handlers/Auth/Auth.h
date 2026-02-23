#pragma once

#include <drogon/HttpController.h>

using namespace drogon;

namespace api
{
  namespace v1
  {
    class Auth : public drogon::HttpController<Auth>
    {
    public:
      METHOD_LIST_BEGIN
      METHOD_ADD(Auth::login, "/login", Post);
      METHOD_ADD(Auth::refresh, "/refresh", Post);
      METHOD_ADD(Auth::logout, "/logout", Post);
      METHOD_LIST_END

      void login(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
      void refresh(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
      void logout(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);

      Auth() { LOG_DEBUG << "Auth controller created"; }
    };
  } // namespace v1
} // namespace api